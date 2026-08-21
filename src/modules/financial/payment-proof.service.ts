import { prisma } from "../../infrastructure/database/prisma.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import {
  PaymentStatus,
  PaymentProofStatus,
  PaymentMethod,
  TransactionType,
  UserRole,
  Prisma,
} from "@prisma/client";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import { generateTransactionNumber, generateReceiptNumber } from "../../common/utils/generators.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

export interface SubmitPaymentProofInput {
  invoiceId: string;
  clientId: string;
  organizationId: string;
  paymentMethod: PaymentMethod;
  claimedAmount: number | Prisma.Decimal;
  paymentDate?: Date | string;
  referenceNumber?: string;
  notes?: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export class PaymentProofService {
  /**
   * Client submits a payment proof document with verification metadata
   */
  async submitPaymentProof(input: SubmitPaymentProofInput) {
    // 1. Verify invoice exists & belongs to client
    const invoice = await prisma.payment.findFirst({
      where: {
        id: input.invoiceId,
        clientId: input.clientId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      include: {
        client: true,
        application: {
          include: { service: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Invoice not found or access denied");
    }

    if (invoice.status === PaymentStatus.PAID) {
      throw new BadRequestError("This invoice is already fully paid.");
    }

    // 2. File validation (PDF, PNG, JPEG)
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!allowedMimeTypes.includes(input.mimeType.toLowerCase())) {
      throw new ValidationError("Invalid file type. Only JPG, PNG, and PDF files are accepted.");
    }

    const buffer = Buffer.from(input.base64Data, "base64");
    if (buffer.length === 0) {
      throw new ValidationError("Uploaded payment proof file is empty.");
    }

    if (buffer.length > 10 * 1024 * 1024) {
      throw new ValidationError("File size exceeds 10MB limit.");
    }

    // 3. Upload proof file to storage
    const uploadedFile = await storageService.upload({
      buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      folder: `clients/${input.clientId}/payment-proofs`,
    });

    const claimedAmountDec = new Prisma.Decimal(input.claimedAmount);
    if (claimedAmountDec.lessThanOrEqualTo(0)) {
      throw new ValidationError("Claimed payment amount must be greater than zero.");
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    // 4. Create record & update invoice status atomically
    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentProofSubmission.create({
        data: {
          organizationId: input.organizationId,
          paymentId: input.invoiceId,
          clientId: input.clientId,
          applicationId: invoice.applicationId,
          paymentMethod: input.paymentMethod || PaymentMethod.BANK,
          claimedAmount: claimedAmountDec,
          paymentDate,
          referenceNumber: input.referenceNumber || null,
          notes: input.notes || null,
          proofFileKey: uploadedFile.storageKey,
          proofFileName: input.fileName,
          proofFileSize: uploadedFile.fileSize,
          proofMimeType: uploadedFile.mimeType,
          status: PaymentProofStatus.PENDING_REVIEW,
        },
        include: {
          payment: true,
          client: true,
          application: true,
        },
      });

      // Update invoice status to PAYMENT_UNDER_REVIEW
      await tx.payment.update({
        where: { id: input.invoiceId },
        data: {
          status: PaymentStatus.PAYMENT_UNDER_REVIEW,
        },
      });

      // Log application activity if application attached
      if (invoice.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: invoice.applicationId,
            actorId: input.clientId,
            actorRole: UserRole.CLIENT,
            action: "PAYMENT_PROOF_SUBMITTED",
            message: `Payment proof submitted for KES ${claimedAmountDec.toString()} (Ref: ${input.referenceNumber || "N/A"})`,
            metadata: {
              proofId: created.id,
              invoiceId: input.invoiceId,
              invoiceNumber: invoice.invoiceNumber,
              claimedAmount: claimedAmountDec.toString(),
            },
          },
        });
      }

      return created;
    });

    // 5. Audit log
    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.clientId,
      actorRole: UserRole.CLIENT,
      action: "SUBMIT_PAYMENT_PROOF",
      resource: "PaymentProofSubmission",
      resourceId: submission.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        claimedAmount: claimedAmountDec.toString(),
        referenceNumber: input.referenceNumber,
      },
    });

    // 6. Notify admin team of pending review
    try {
      const admins = await prisma.user.findMany({
        where: {
          organizationId: input.organizationId,
          role: UserRole.ADMIN,
          isActive: true,
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            organizationId: input.organizationId,
            userId: admin.id,
            clientId: input.clientId,
            applicationId: invoice.applicationId,
            type: "PAYMENT_PROOF_SUBMITTED",
            title: "New Payment Proof Submitted",
            message: `${invoice.client.fullName} submitted proof of payment (KES ${claimedAmountDec.toString()}) for invoice ${invoice.invoiceNumber}.`,
            metadata: {
              proofId: submission.id,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            },
          },
        });
      }
    } catch (err) {
      console.error("[PaymentProofService] Admin notification failed:", err);
    }

    return submission;
  }

  /**
   * List payment proof submissions for admin review
   */
  async listPaymentProofs(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: PaymentProofStatus;
      search?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentProofSubmissionWhereInput = {
      organizationId,
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { referenceNumber: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { payment: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    const [submissions, total] = await Promise.all([
      prisma.paymentProofSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: {
            select: {
              id: true,
              clientNumber: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          payment: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              amountPaid: true,
              amountDue: true,
              status: true,
            },
          },
          application: {
            select: {
              id: true,
              applicationNumber: true,
              service: { select: { name: true } },
            },
          },
          reviewedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.paymentProofSubmission.count({ where }),
    ]);

    return {
      data: submissions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single payment proof submission detail with file secure URL
   */
  async getPaymentProofById(id: string, organizationId: string, clientId?: string) {
    const where: Prisma.PaymentProofSubmissionWhereInput = {
      id,
      organizationId,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    const proof = await prisma.paymentProofSubmission.findFirst({
      where,
      include: {
        client: true,
        payment: {
          include: { lineItems: true },
        },
        application: {
          include: { service: true },
        },
        reviewedBy: true,
      },
    });

    if (!proof) {
      throw new NotFoundError("Payment proof submission not found");
    }

    let secureUrl: string | null = null;
    if (proof.proofFileKey) {
      secureUrl = await storageService.generateSecureUrl(proof.proofFileKey, 3600);
    }

    return {
      ...proof,
      proofFileUrl: secureUrl,
    };
  }

  /**
   * Admin approves payment proof submission
   */
  async approvePaymentProof(
    proofId: string,
    organizationId: string,
    adminUser: { id: string; email: string }
  ) {
    const proof = await prisma.paymentProofSubmission.findFirst({
      where: { id: proofId, organizationId },
      include: {
        payment: true,
        client: { include: { user: true } },
        application: { include: { service: true } },
      },
    });

    if (!proof) {
      throw new NotFoundError("Payment proof submission not found");
    }

    if (proof.status === PaymentProofStatus.APPROVED) {
      throw new BadRequestError("This payment proof has already been approved.");
    }

    const transactionNumber = await generateTransactionNumber(organizationId);
    const receiptNumber = await generateReceiptNumber(organizationId);
    const idempotencyKey = `PROOF_APPROVE_${proof.id}_${Date.now()}`;
    const amount = proof.claimedAmount;

    // Atomically execute payment verification transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock payment record & recalculate totals
      const currentInvoice = await tx.payment.findUniqueOrThrow({
        where: { id: proof.paymentId },
      });

      const newAmountPaid = currentInvoice.amountPaid.plus(amount);
      const newAmountDue = currentInvoice.totalAmount.minus(newAmountPaid);
      const isFullyPaid = newAmountDue.lessThanOrEqualTo(0);
      const newStatus = isFullyPaid ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;

      // 2. Create PaymentTransaction
      const transaction = await tx.paymentTransaction.create({
        data: {
          organizationId,
          paymentId: proof.paymentId,
          clientId: proof.clientId,
          applicationId: proof.applicationId,
          transactionNumber,
          transactionType: TransactionType.PAYMENT,
          paymentMethod: proof.paymentMethod,
          amount,
          currency: "KES",
          status: PaymentStatus.COMPLETED,
          idempotencyKey,
          externalReference: proof.referenceNumber || `PROOF-${proof.id.substring(0, 8)}`,
          paidAt: proof.paymentDate || new Date(),
        },
      });

      // 3. Update Invoice
      const updatedInvoice = await tx.payment.update({
        where: { id: proof.paymentId },
        data: {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue.lessThan(0) ? new Prisma.Decimal(0) : newAmountDue,
          status: newStatus,
          paidAt: isFullyPaid ? new Date() : currentInvoice.paidAt,
        },
      });

      // 4. Mark Proof APPROVED
      const updatedProof = await tx.paymentProofSubmission.update({
        where: { id: proofId },
        data: {
          status: PaymentProofStatus.APPROVED,
          reviewedById: adminUser.id,
          reviewedAt: new Date(),
        },
      });

      // 5. Generate Receipt
      const receipt = await tx.receipt.create({
        data: {
          organizationId,
          clientId: proof.clientId,
          applicationId: proof.applicationId || currentInvoice.applicationId,
          paymentId: proof.paymentId,
          transactionId: transaction.id,
          receiptNumber,
          amount,
          currency: "KES",
          paymentMethod: proof.paymentMethod,
          transactionReference: proof.referenceNumber || transactionNumber,
          payerName: proof.client.fullName,
          amountPaid: newAmountPaid,
          remainingBalance: newAmountDue.lessThan(0) ? new Prisma.Decimal(0) : newAmountDue,
          issuedAt: new Date(),
        },
      });

      // 6. Record Application Activity
      if (proof.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: proof.applicationId,
            actorId: adminUser.id,
            actorRole: UserRole.ADMIN,
            action: "PAYMENT_PROOF_APPROVED",
            message: `Manual payment proof approved for KES ${amount.toString()} (Invoice ${currentInvoice.invoiceNumber}). Status: ${newStatus}`,
            metadata: {
              proofId,
              transactionNumber,
              receiptNumber,
              invoiceNumber: currentInvoice.invoiceNumber,
              newStatus,
            },
          },
        });
      }

      // 7. Write Audit Log
      await recordAuditLog(
        {
          organizationId,
          actorId: adminUser.id,
          actorEmail: adminUser.email,
          actorRole: UserRole.ADMIN,
          action: "APPROVE_PAYMENT_PROOF",
          resource: "PaymentProofSubmission",
          resourceId: proofId,
          metadata: {
            invoiceNumber: currentInvoice.invoiceNumber,
            amount: amount.toString(),
            transactionNumber,
            receiptNumber,
            newStatus,
          },
        },
        tx
      );

      return {
        transaction,
        invoice: updatedInvoice,
        proof: updatedProof,
        receipt,
      };
    });

    // Notify Client
    if (proof.client.user) {
      const ctx = {
        organizationId,
        applicationId: proof.applicationId || "",
        applicationNumber: proof.application?.applicationNumber || "N/A",
        serviceName: proof.application?.service?.name || "Statutory Service",
        clientUserId: proof.client.user.id,
        clientName: proof.client.fullName,
        clientEmail: proof.client.email,
        clientPhone: proof.client.phone,
      };

      notificationOrchestrator
        .notifyPaymentReceived(ctx, {
          amount: amount.toString(),
          receiptNumber,
          invoiceNumber: proof.payment.invoiceNumber,
          transactionNumber,
        })
        .catch((err) => console.error("[PaymentProofService] Failed to send approval notification:", err));
    }

    return result;
  }

  /**
   * Admin rejects payment proof submission with reason
   */
  async rejectPaymentProof(
    proofId: string,
    organizationId: string,
    rejectionReason: string,
    adminUser: { id: string; email: string }
  ) {
    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new BadRequestError("Rejection reason is mandatory when rejecting payment proof.");
    }

    const proof = await prisma.paymentProofSubmission.findFirst({
      where: { id: proofId, organizationId },
      include: {
        payment: true,
        client: { include: { user: true } },
        application: { include: { service: true } },
      },
    });

    if (!proof) {
      throw new NotFoundError("Payment proof submission not found");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark proof REJECTED
      const updatedProof = await tx.paymentProofSubmission.update({
        where: { id: proofId },
        data: {
          status: PaymentProofStatus.REJECTED,
          rejectionReason,
          reviewedById: adminUser.id,
          reviewedAt: new Date(),
        },
      });

      // 2. Reset Invoice Status
      const invoice = proof.payment;
      const resetStatus = invoice.amountPaid.greaterThan(0)
        ? PaymentStatus.PARTIALLY_PAID
        : PaymentStatus.ISSUED;

      await tx.payment.update({
        where: { id: proof.paymentId },
        data: { status: resetStatus },
      });

      // 3. Application Activity
      if (proof.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: proof.applicationId,
            actorId: adminUser.id,
            actorRole: UserRole.ADMIN,
            action: "PAYMENT_PROOF_REJECTED",
            message: `Payment proof rejected: ${rejectionReason}`,
            metadata: {
              proofId,
              invoiceNumber: invoice.invoiceNumber,
              rejectionReason,
            },
          },
        });
      }

      // 4. Audit Log
      await recordAuditLog(
        {
          organizationId,
          actorId: adminUser.id,
          actorEmail: adminUser.email,
          actorRole: UserRole.ADMIN,
          action: "REJECT_PAYMENT_PROOF",
          resource: "PaymentProofSubmission",
          resourceId: proofId,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            rejectionReason,
          },
        },
        tx
      );

      return updatedProof;
    });

    // Notify Client with rejection reason & action link
    if (proof.client.user) {
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId: proof.client.user.id,
            clientId: proof.clientId,
            applicationId: proof.applicationId,
            type: "PAYMENT_PROOF_REJECTED",
            title: "Payment Proof Requires Attention",
            message: `Your submitted payment proof for invoice ${proof.payment.invoiceNumber} was not approved. Reason: ${rejectionReason}`,
            metadata: {
              proofId,
              invoiceId: proof.paymentId,
              invoiceNumber: proof.payment.invoiceNumber,
              rejectionReason,
            },
          },
        });
      } catch (err) {
        console.error("[PaymentProofService] Failed to notify client of rejection:", err);
      }
    }

    return result;
  }
}

export const paymentProofService = new PaymentProofService();
