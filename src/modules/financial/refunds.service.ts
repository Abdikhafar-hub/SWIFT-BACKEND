import { prisma } from "../../infrastructure/database/prisma.js";
import {
  Prisma,
  RefundStatus,
  PaymentStatus,
  TransactionType,
  UserRole,
} from "@prisma/client";
import {
  NotFoundError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import { toDecimal } from "../../common/utils/money.js";
import {
  generateRefundNumber,
  generateTransactionNumber,
} from "../../common/utils/generators.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

export interface RequestRefundInput {
  paymentId: string;
  transactionId: string;
  amount: number | Prisma.Decimal;
  reason: string;
}

export class RefundsService {
  /**
   * Request a new refund
   */
  async requestRefund(
    input: RequestRefundInput,
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
            status: { in: [RefundStatus.REQUESTED, RefundStatus.APPROVED, RefundStatus.PROCESSING, RefundStatus.COMPLETED] },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError("Payment/Invoice not found");
    }

    const transaction = payment.transactions.find((tx) => tx.id === input.transactionId);
    if (!transaction) {
      throw new NotFoundError("Original payment transaction not found on this invoice");
    }

    if (transaction.status !== PaymentStatus.COMPLETED && transaction.status !== PaymentStatus.PAID) {
      throw new BadRequestError("Cannot refund an uncompleted transaction");
    }

    // Check available refundable amount
    const totalExistingRefunds = payment.refunds.reduce(
      (sum, r) => sum.add(r.amount),
      new Prisma.Decimal(0)
    );

    const maxRefundable = payment.amountPaid.sub(totalExistingRefunds);
    if (refundAmount.greaterThan(maxRefundable)) {
      throw new BadRequestError(
        `Requested refund (KES ${refundAmount.toString()}) exceeds available paid balance (KES ${maxRefundable.toString()})`
      );
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
        status: RefundStatus.REQUESTED,
        requestedById: user.id,
        metadata: {
          invoiceNumber: payment.invoiceNumber,
          originalTransactionNumber: transaction.transactionNumber,
          originalAmount: transaction.amount.toString(),
        },
      },
    });

    await recordAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REQUEST_REFUND",
      resource: "Refund",
      resourceId: refund.id,
      metadata: {
        refundNumber,
        amount: refundAmount.toString(),
        reason: input.reason,
      },
    });

    return refund;
  }

  /**
   * Approve and process a refund atomically
   */
  async approveAndProcessRefund(
    refundId: string,
    organizationId: string,
    user: { id: string; organizationId: string },
    notes?: string
  ) {
    const refund = await prisma.refund.findFirst({
      where: {
        id: refundId,
        organizationId,
      },
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

    if (refund.status !== RefundStatus.REQUESTED && refund.status !== RefundStatus.APPROVED) {
      throw new BadRequestError(`Cannot process refund with status '${refund.status}'`);
    }

    const refundTxNumber = await generateTransactionNumber(organizationId);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create negative / refund transaction record
      const refundTransaction = await tx.paymentTransaction.create({
        data: {
          paymentId: refund.paymentId,
          organizationId,
          clientId: refund.clientId,
          applicationId: refund.payment.applicationId,
          transactionNumber: refundTxNumber,
          transactionType: TransactionType.REFUND,
          paymentMethod: refund.transaction.paymentMethod,
          amount: refund.amount,
          currency: refund.currency,
          status: PaymentStatus.COMPLETED,
          idempotencyKey: `REFUND_${refund.id}_${Date.now()}`,
          externalReference: `RF-${refund.refundNumber}`,
          paidAt: new Date(),
          reversalReason: refund.reason,
          providerResponse: {
            refundId: refund.id,
            refundNumber: refund.refundNumber,
            originalTransactionId: refund.transactionId,
            notes: notes || null,
          },
        },
      });

      // 2. Update Payment totals and status
      const newAmountPaid = refund.payment.amountPaid.sub(refund.amount);
      const effectivePaid = newAmountPaid.lessThan(0) ? new Prisma.Decimal(0) : newAmountPaid;
      const newAmountDue = refund.payment.totalAmount.sub(effectivePaid);

      let newStatus: PaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
      if (effectivePaid.isZero()) {
        newStatus = PaymentStatus.REFUNDED;
      } else if (newAmountDue.greaterThan(0)) {
        newStatus = PaymentStatus.PARTIALLY_PAID;
      }

      await tx.payment.update({
        where: { id: refund.paymentId },
        data: {
          amountPaid: effectivePaid,
          amountDue: newAmountDue,
          status: newStatus,
        },
      });

      // 3. Mark Refund as COMPLETED
      const updatedRefund = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.COMPLETED,
          approvedById: user.id,
          processedAt: new Date(),
          metadata: {
            ...(refund.metadata as object || {}),
            processedBy: user.id,
            refundTransactionNumber: refundTxNumber,
            notes: notes || null,
          },
        },
      });

      // 4. Log application activity
      if (refund.payment.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: refund.payment.applicationId,
            actorId: user.id,
            actorRole: UserRole.ADMIN,
            action: "REFUND_COMPLETED",
            message: `Refund ${refund.refundNumber} of KES ${refund.amount.toString()} completed. New balance due: KES ${newAmountDue.toString()}`,
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
      action: "PROCESS_REFUND",
      resource: "Refund",
      resourceId: refundId,
      metadata: {
        refundNumber: refund.refundNumber,
        amount: refund.amount.toString(),
        refundTransactionNumber: refundTxNumber,
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
        .catch((err) => console.error("[RefundsService] Failed to notify refund:", err));
    }

    return result.updatedRefund;
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

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BadRequestError(`Cannot reject refund with status '${refund.status}'`);
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.CANCELLED,
        approvedById: user.id,
        metadata: {
          ...(refund.metadata as object || {}),
          rejectionReason: reason,
          rejectedBy: user.id,
          rejectedAt: new Date().toISOString(),
        },
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "REJECT_REFUND",
      resource: "Refund",
      resourceId: refundId,
      metadata: {
        refundNumber: refund.refundNumber,
        reason,
      },
    });

    return updated;
  }

  /**
   * List refunds for admin
   */
  async listAdminRefunds(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: RefundStatus;
      clientId?: string;
      paymentId?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
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

    if (params.search) {
      where.OR = [
        { refundNumber: { contains: params.search, mode: "insensitive" } },
        { reason: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { payment: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    const [refunds, total] = await Promise.all([
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
    ]);

    return {
      data: refunds,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single refund by ID
   */
  async getAdminRefundById(id: string, organizationId: string) {
    const refund = await prisma.refund.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        payment: {
          include: {
            application: true,
            lineItems: true,
          },
        },
        transaction: true,
        requestedBy: { select: { id: true, email: true } },
        approvedBy: { select: { id: true, email: true } },
      },
    });

    if (!refund) {
      throw new NotFoundError("Refund not found");
    }

    return refund;
  }
}

export const refundsService = new RefundsService();
