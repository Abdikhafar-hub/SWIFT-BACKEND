import { prisma } from "../../infrastructure/database/prisma.js";
import {
  Prisma,
  RefundStatus,
  PaymentStatus,
  PaymentMethod,
  TransactionType,
  UserRole,
} from "@prisma/client";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../common/errors/app-error.js";
import { toDecimal } from "../../common/utils/money.js";
import {
  generateRefundNumber,
  generateTransactionNumber,
} from "../../common/utils/generators.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

export interface InitiateRefundInput {
  paymentId: string;
  transactionId: string;
  amount: number | Prisma.Decimal;
  reason: string;
  reasonCategory?: string;
  refundMethod?: PaymentMethod;
  recipientPhone?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  referenceDetails?: string;
  internalNotes?: string;
  supportingDocumentUrl?: string;
  clientExplanation?: string;
}

export class RefundsService {
  /**
   * Helper: Get eligible clients, invoices, and payment transactions with refundable balances
   */
  async getEligibleFinancialSources(
    organizationId: string,
    params?: { search?: string; clientId?: string }
  ) {
    const whereClause: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (params?.clientId) {
      whereClause.clientId = params.clientId;
    }

    if (params?.search) {
      whereClause.OR = [
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { client: { clientNumber: { contains: params.search, mode: "insensitive" } } },
        { application: { applicationNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    let payments;
    try {
      payments = await prisma.payment.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              clientNumber: true,
            },
          },
          application: {
            select: {
              id: true,
              applicationNumber: true,
              service: { select: { name: true } },
            },
          },
          transactions: {
            where: {
              status: PaymentStatus.COMPLETED,
              transactionType: TransactionType.PAYMENT,
            },
            select: {
              id: true,
              transactionNumber: true,
              paymentMethod: true,
              amount: true,
              paidAt: true,
              externalReference: true,
              phoneNumber: true,
            },
          },
          refunds: {
            where: {
              status: {
                in: [
                  RefundStatus.DRAFT,
                  RefundStatus.PENDING_APPROVAL,
                  RefundStatus.REQUESTED,
                  RefundStatus.APPROVED,
                  RefundStatus.PROCESSING,
                  RefundStatus.COMPLETED,
                ],
              },
            },
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (err: any) {
      console.error("Prisma error in getEligibleFinancialSources:", err?.message || err);
      throw err;
    }

    const eligibleSources = payments
      .map((payment) => {
        const txPaid = payment.transactions.reduce(
          (sum, t) => sum.add(t.amount),
          new Prisma.Decimal(0)
        );
        const grossPaid = txPaid.greaterThan(0) ? txPaid : payment.amountPaid;

        const totalRefundedSum = payment.refunds.reduce(
          (sum, r) => sum.add(r.amount),
          new Prisma.Decimal(0)
        );
        const maxRefundable = grossPaid.sub(totalRefundedSum);

        return {
          paymentId: payment.id,
          invoiceNumber: payment.invoiceNumber,
          totalAmount: payment.totalAmount,
          amountPaid: grossPaid,
          amountDue: payment.amountDue,
          previouslyRefunded: totalRefundedSum,
          remainingRefundable: maxRefundable.lessThan(0)
            ? new Prisma.Decimal(0)
            : maxRefundable,
          client: payment.client,
          application: payment.application,
          transactions: payment.transactions,
          refunds: payment.refunds,
        };
      })
      .filter((item) => item.remainingRefundable.greaterThan(0) && item.transactions.length > 0);

    return eligibleSources;

    return eligibleSources;
  }

  /**
   * Initiate a manual refund request
   */
  async initiateRefund(
    input: InitiateRefundInput,
    user: { id: string; organizationId: string }
  ) {
    const refundAmount = toDecimal(input.amount);
    if (refundAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestError("Refund amount must be strictly greater than 0");
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: input.paymentId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        transactions: true,
        refunds: {
          where: {
            status: {
              in: [
                RefundStatus.DRAFT,
                RefundStatus.PENDING_APPROVAL,
                RefundStatus.REQUESTED,
                RefundStatus.APPROVED,
                RefundStatus.PROCESSING,
                RefundStatus.COMPLETED,
              ],
            },
          },
        },
        client: true,
      },
    });

    if (!payment) {
      throw new NotFoundError("Payment/Invoice not found");
    }

    const transaction = payment.transactions.find((tx) => tx.id === input.transactionId);
    if (!transaction) {
      throw new NotFoundError("Original payment transaction not found on this invoice");
    }

    if (
      transaction.status !== PaymentStatus.COMPLETED &&
      transaction.status !== PaymentStatus.PAID
    ) {
      throw new BadRequestError("Cannot refund an uncompleted payment transaction");
    }

    // Check available refundable balance
    const txPaid = payment.transactions.reduce(
      (sum, t) => sum.add(t.amount),
      new Prisma.Decimal(0)
    );
    const grossPaid = txPaid.greaterThan(0) ? txPaid : payment.amountPaid;

    const totalExistingRefunds = payment.refunds.reduce(
      (sum, r) => sum.add(r.amount),
      new Prisma.Decimal(0)
    );

    const maxRefundable = grossPaid.sub(totalExistingRefunds);
    if (refundAmount.greaterThan(maxRefundable)) {
      throw new BadRequestError(
        `Requested refund (KES ${refundAmount.toString()}) exceeds maximum remaining refundable balance (KES ${maxRefundable.toString()})`
      );
    }

    // Clean / normalize phone if M-Pesa method
    let normalizedPhone = input.recipientPhone;
    if (input.refundMethod === PaymentMethod.MPESA && (input.recipientPhone || payment.client.phone)) {
      const targetPhone = input.recipientPhone || payment.client.phone;
      normalizedPhone = notificationOrchestrator.normalizePhoneNumber(targetPhone);
    }

    const refundNumber = await generateRefundNumber(user.organizationId);

    const refund = await prisma.refund.create({
      data: {
        organizationId: user.organizationId,
        clientId: payment.clientId,
        paymentId: payment.id,
        transactionId: transaction.id,
        refundNumber,
        amount: refundAmount,
        currency: "KES",
        reason: input.reason,
        reasonCategory: input.reasonCategory || "CLIENT_OVERPAYMENT",
        refundMethod: input.refundMethod || transaction.paymentMethod || PaymentMethod.MPESA,
        status: RefundStatus.PENDING_APPROVAL,
        recipientPhone: normalizedPhone,
        bankName: input.bankName,
        accountHolder: input.accountHolder,
        accountNumber: input.accountNumber,
        referenceDetails: input.referenceDetails,
        internalNotes: input.internalNotes,
        supportingDocumentUrl: input.supportingDocumentUrl,
        clientExplanation: input.clientExplanation,
        requestedById: user.id,
        metadata: {
          invoiceNumber: payment.invoiceNumber,
          originalTransactionNumber: transaction.transactionNumber,
          originalAmount: transaction.amount.toString(),
          originalPaymentMethod: transaction.paymentMethod,
        },
      },
      include: {
        client: true,
        payment: true,
        transaction: true,
      },
    });

    await recordAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_CREATED",
      resource: "Refund",
      resourceId: refund.id,
      description: `Initiated manual refund claim ${refundNumber} for KES ${refundAmount.toString()}`,
      metadata: {
        refundNumber,
        amount: refundAmount.toString(),
        reason: input.reason,
        category: input.reasonCategory,
        method: input.refundMethod,
      },
    });

    return refund;
  }

  /**
   * Alias for initiateRefund to maintain backward compatibility
   */
  async requestRefund(
    input: InitiateRefundInput,
    user: { id: string; organizationId: string }
  ) {
    return this.initiateRefund(input, user);
  }

  /**
   * Approve refund request
   */
  async approveRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    notes?: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status !== RefundStatus.PENDING_APPROVAL &&
      refund.status !== RefundStatus.REQUESTED &&
      refund.status !== RefundStatus.DRAFT
    ) {
      throw new BadRequestError(`Cannot approve refund in '${refund.status}' state`);
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        internalNotes: notes
          ? refund.internalNotes
            ? `${refund.internalNotes}\n[Approval Notes]: ${notes}`
            : notes
          : refund.internalNotes,
      },
      include: {
        client: true,
        payment: true,
        transaction: true,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_APPROVED",
      resource: "Refund",
      resourceId: refundId,
      description: `Approved refund claim ${refund.refundNumber}`,
      metadata: {
        refundNumber: refund.refundNumber,
        amount: refund.amount.toString(),
        notes,
      },
    });

    return updated;
  }

  /**
   * Begin processing refund
   */
  async processRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    notes?: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status !== RefundStatus.APPROVED &&
      refund.status !== RefundStatus.PENDING_APPROVAL &&
      refund.status !== RefundStatus.REQUESTED
    ) {
      throw new BadRequestError(`Cannot start processing refund in '${refund.status}' state`);
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.PROCESSING,
        processingStartedAt: new Date(),
        internalNotes: notes
          ? refund.internalNotes
            ? `${refund.internalNotes}\n[Processing Notes]: ${notes}`
            : notes
          : refund.internalNotes,
      },
      include: {
        client: true,
        payment: true,
        transaction: true,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_PROCESSING_STARTED",
      resource: "Refund",
      resourceId: refundId,
      description: `Started processing disbursement for refund claim ${refund.refundNumber}`,
      metadata: {
        refundNumber: refund.refundNumber,
        amount: refund.amount.toString(),
        notes,
      },
    });

    return updated;
  }

  /**
   * Complete refund disbursement atomically
   */
  async completeRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    notes?: string,
    externalReference?: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, organizationId },
      include: {
        payment: {
          include: {
            application: true,
            client: true,
          },
        },
        transaction: true,
      },
    });

    if (!refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status !== RefundStatus.PROCESSING &&
      refund.status !== RefundStatus.APPROVED &&
      refund.status !== RefundStatus.PENDING_APPROVAL &&
      refund.status !== RefundStatus.REQUESTED
    ) {
      throw new BadRequestError(`Cannot complete refund with status '${refund.status}'`);
    }

    const refundTxNumber = await generateTransactionNumber(organizationId);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-verify balance inside transaction to prevent concurrency over-refunds
      const currentPayment = await tx.payment.findUnique({
        where: { id: refund.paymentId },
        include: {
          transactions: {
            where: {
              status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PAID] },
              transactionType: TransactionType.PAYMENT,
            },
          },
          refunds: {
            where: {
              status: RefundStatus.COMPLETED,
              id: { not: refundId },
            },
          },
        },
      });

      if (!currentPayment) {
        throw new NotFoundError("Associated payment not found");
      }

      const previousRefundsSum = currentPayment.refunds.reduce(
        (sum, r) => sum.add(r.amount),
        new Prisma.Decimal(0)
      );

      const txPaid = currentPayment.transactions.reduce(
        (sum, t) => sum.add(t.amount),
        new Prisma.Decimal(0)
      );
      const grossPaid = txPaid.greaterThan(0) ? txPaid : currentPayment.amountPaid;

      const maxRemaining = grossPaid.sub(previousRefundsSum);
      if (refund.amount.greaterThan(maxRemaining)) {
        throw new BadRequestError(
          `Refund amount (KES ${refund.amount.toString()}) exceeds available paid balance (KES ${maxRemaining.toString()})`
        );
      }

      // 2. Create negative / refund transaction record
      const refundTransaction = await tx.paymentTransaction.create({
        data: {
          paymentId: refund.paymentId,
          organizationId,
          clientId: refund.clientId,
          applicationId: refund.payment.applicationId,
          transactionNumber: refundTxNumber,
          transactionType: TransactionType.REFUND,
          paymentMethod: refund.refundMethod || refund.transaction.paymentMethod,
          amount: refund.amount,
          currency: refund.currency,
          status: PaymentStatus.COMPLETED,
          idempotencyKey: `REFUND_SETTLEMENT_${refund.id}_${Date.now()}`,
          externalReference: externalReference || refund.externalReference || `RF-${refund.refundNumber}`,
          phoneNumber: refund.recipientPhone || refund.transaction.phoneNumber,
          paidAt: new Date(),
          reversalReason: refund.reason,
          providerResponse: {
            refundId: refund.id,
            refundNumber: refund.refundNumber,
            originalTransactionId: refund.transactionId,
            reasonCategory: refund.reasonCategory,
            notes: notes || null,
          },
        },
      });

      // 3. Update Payment totals and status
      const updatedRefundsSum = currentPayment.refunds
        .filter((r) => r.status === RefundStatus.COMPLETED || r.id === refundId)
        .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));

      const netPaid = grossPaid.sub(updatedRefundsSum);
      const effectivePaid = netPaid.lessThan(0) ? new Prisma.Decimal(0) : netPaid;
      const newAmountDue = currentPayment.totalAmount.sub(effectivePaid);

      let newStatus: PaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
      if (effectivePaid.isZero()) {
        newStatus = PaymentStatus.REFUNDED;
      }

      await tx.payment.update({
        where: { id: refund.paymentId },
        data: {
          amountPaid: effectivePaid,
          amountDue: newAmountDue,
          status: newStatus,
        },
      });

      // 4. Mark Refund as COMPLETED
      const updatedRefund = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.COMPLETED,
          approvedById: refund.approvedById || user.id,
          approvedAt: refund.approvedAt || new Date(),
          completedById: user.id,
          completedAt: new Date(),
          processedAt: new Date(),
          externalReference: externalReference || refund.externalReference || `RF-${refund.refundNumber}`,
          internalNotes: notes
            ? refund.internalNotes
              ? `${refund.internalNotes}\n[Completion Notes]: ${notes}`
              : notes
            : refund.internalNotes,
          metadata: {
            ...(refund.metadata as object || {}),
            completedBy: user.id,
            refundTransactionNumber: refundTxNumber,
            externalReference: externalReference || null,
            notes: notes || null,
          },
        },
      });

      // 5. Log application activity if applicable
      if (refund.payment.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: refund.payment.applicationId,
            actorId: user.id,
            actorRole: UserRole.ADMIN,
            action: "REFUND_COMPLETED",
            message: `Refund ${refund.refundNumber} of KES ${refund.amount.toString()} completed via ${refund.refundMethod}. Remaining balance due: KES ${newAmountDue.toString()}`,
            metadata: {
              refundId: refund.id,
              refundNumber: refund.refundNumber,
              amount: refund.amount.toString(),
              transactionNumber: refundTxNumber,
            },
          },
        });
      }

      return { updatedRefund, refundTransaction };
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_COMPLETED",
      resource: "Refund",
      resourceId: refundId,
      description: `Completed financial refund disbursement for ${refund.refundNumber}`,
      metadata: {
        refundNumber: refund.refundNumber,
        amount: refund.amount.toString(),
        refundTransactionNumber: refundTxNumber,
        externalReference: externalReference || null,
      },
    });

    // Notify client
    if (refund.payment.application) {
      notificationOrchestrator
        .notifyRefundCompleted({
          organizationId,
          clientId: refund.clientId,
          refundNumber: refund.refundNumber,
          amount: refund.amount.toString(),
          invoiceNumber: refund.payment.invoiceNumber,
          applicationNumber: refund.payment.application.applicationNumber,
        })
        .catch((err) => console.error("[RefundsService] Failed to send notification:", err));
    }

    return result.updatedRefund;
  }

  /**
   * Alias for approveAndProcessRefund to maintain backward compatibility
   */
  async approveAndProcessRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    notes?: string
  ) {
    return this.completeRefund(refundId, organizationId, user, notes);
  }

  /**
   * Reject a refund request
   */
  async rejectRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    reason: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status === RefundStatus.COMPLETED ||
      refund.status === RefundStatus.CANCELLED ||
      refund.status === RefundStatus.REJECTED
    ) {
      throw new BadRequestError(`Cannot reject refund with status '${refund.status}'`);
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.REJECTED,
        rejectedById: user.id,
        rejectedAt: new Date(),
        rejectionReason: reason,
        metadata: {
          ...(refund.metadata as object || {}),
          rejectionReason: reason,
          rejectedBy: user.id,
          rejectedAt: new Date().toISOString(),
        },
      },
      include: {
        client: true,
        payment: true,
        transaction: true,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_REJECTED",
      resource: "Refund",
      resourceId: refundId,
      description: `Rejected refund claim ${refund.refundNumber}`,
      metadata: {
        refundNumber: refund.refundNumber,
        reason,
      },
    });

    return updated;
  }

  /**
   * Cancel a refund request
   */
  async cancelRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    reason?: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, organizationId },
    });

    if (!refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status === RefundStatus.COMPLETED ||
      refund.status === RefundStatus.CANCELLED ||
      refund.status === RefundStatus.REJECTED
    ) {
      throw new BadRequestError(`Cannot cancel refund with status '${refund.status}'`);
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.CANCELLED,
        cancelledById: user.id,
        cancelledAt: new Date(),
        internalNotes: reason
          ? refund.internalNotes
            ? `${refund.internalNotes}\n[Cancellation Reason]: ${reason}`
            : reason
          : refund.internalNotes,
      },
      include: {
        client: true,
        payment: true,
        transaction: true,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REFUND_CANCELLED",
      resource: "Refund",
      resourceId: refundId,
      description: `Cancelled refund claim ${refund.refundNumber}`,
      metadata: {
        refundNumber: refund.refundNumber,
        reason: reason || null,
      },
    });

    return updated;
  }

  /**
   * List refunds for admin with full filtering & KPI metrics
   */
  async listAdminRefunds(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: RefundStatus;
      clientId?: string;
      paymentId?: string;
      reasonCategory?: string;
      refundMethod?: PaymentMethod;
      search?: string;
      fromDate?: string;
      toDate?: string;
      minAmount?: number | string;
      maxAmount?: number | string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RefundWhereInput = {
      organizationId,
    };

    if (params.status) where.status = params.status;
    if (params.clientId) where.clientId = params.clientId;
    if (params.paymentId) where.paymentId = params.paymentId;
    if (params.reasonCategory) where.reasonCategory = params.reasonCategory;
    if (params.refundMethod) where.refundMethod = params.refundMethod;

    if (params.search) {
      where.OR = [
        { refundNumber: { contains: params.search, mode: "insensitive" } },
        { reason: { contains: params.search, mode: "insensitive" } },
        { recipientPhone: { contains: params.search, mode: "insensitive" } },
        { externalReference: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { client: { email: { contains: params.search, mode: "insensitive" } } },
        { payment: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
        { transaction: { transactionNumber: { contains: params.search, mode: "insensitive" } } },
        { transaction: { externalReference: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    if (params.minAmount || params.maxAmount) {
      where.amount = {};
      if (params.minAmount) where.amount.gte = toDecimal(params.minAmount);
      if (params.maxAmount) where.amount.lte = toDecimal(params.maxAmount);
    }

    // Run queries & calculate metrics in parallel
    const [refunds, total, allOrgRefunds] = await Promise.all([
      prisma.refund.findMany({
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
              application: {
                select: {
                  id: true,
                  applicationNumber: true,
                },
              },
            },
          },
          transaction: {
            select: {
              id: true,
              transactionNumber: true,
              paymentMethod: true,
              externalReference: true,
            },
          },
          requestedBy: {
            select: { id: true, email: true },
          },
          approvedBy: {
            select: { id: true, email: true },
          },
        },
      }),
      prisma.refund.count({ where }),
      prisma.refund.findMany({
        where: { organizationId },
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const pendingApprovalCount = allOrgRefunds.filter(
      (r) => r.status === RefundStatus.PENDING_APPROVAL || r.status === RefundStatus.REQUESTED
    ).length;

    const processingCount = allOrgRefunds.filter(
      (r) => r.status === RefundStatus.PROCESSING
    ).length;

    const completedThisMonthCount = allOrgRefunds.filter(
      (r) => r.status === RefundStatus.COMPLETED && new Date(r.createdAt) >= startOfMonth
    ).length;

    const totalRefundedSum = allOrgRefunds
      .filter((r) => r.status === RefundStatus.COMPLETED)
      .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));

    const failedOrRejectedCount = allOrgRefunds.filter(
      (r) => r.status === RefundStatus.FAILED || r.status === RefundStatus.REJECTED
    ).length;

    return {
      data: refunds,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      metrics: {
        pendingApproval: pendingApprovalCount,
        processingRefunds: processingCount,
        completedThisMonth: completedThisMonthCount,
        totalRefunded: totalRefundedSum.toString(),
        failedOrRejected: failedOrRejectedCount,
      },
    };
  }

  /**
   * Get single refund by ID with audit trail history
   */
  async getAdminRefundById(id: string, organizationId: string) {
    const refund = await prisma.refund.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        payment: {
          include: {
            application: {
              include: {
                service: true,
              },
            },
            lineItems: true,
            transactions: true,
            refunds: true,
          },
        },
        transaction: true,
        requestedBy: { select: { id: true, email: true, role: true } },
        approvedBy: { select: { id: true, email: true, role: true } },
      },
    });

    if (!refund) {
      throw new NotFoundError("Refund not found");
    }

    // Fetch related audit logs for financial traceability
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        resource: "Refund",
        resourceId: id,
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate invoice refundable balance snapshot
    const totalPreviousRefunds = refund.payment.refunds
      .filter(
        (r) =>
          r.id !== id &&
          r.status !== RefundStatus.REJECTED &&
          r.status !== RefundStatus.CANCELLED &&
          r.status !== RefundStatus.FAILED
      )
      .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));

    const remainingRefundableBalance = refund.payment.amountPaid
      .sub(totalPreviousRefunds)
      .sub(refund.status === RefundStatus.COMPLETED ? new Prisma.Decimal(0) : refund.amount);

    return {
      ...refund,
      auditLogs,
      financialSummary: {
        invoiceTotal: refund.payment.totalAmount,
        amountPaid: refund.payment.amountPaid,
        previousRefundsTotal: totalPreviousRefunds,
        currentRefundAmount: refund.amount,
        remainingRefundableBalance: remainingRefundableBalance.lessThan(0)
          ? new Prisma.Decimal(0)
          : remainingRefundableBalance,
      },
    };
  }
}

export const refundsService = new RefundsService();
