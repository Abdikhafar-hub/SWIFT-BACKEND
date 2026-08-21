import { prisma } from "../../infrastructure/database/prisma.js";
import {
  PaymentStatus,
  InvoiceLineItemCategory,
  AdjustmentType,
  UserRole,
  Prisma,
} from "@prisma/client";
import {
  BadRequestError,
  NotFoundError,
} from "../../common/errors/app-error.js";
import {
  calculateInvoiceTotals,
  calculatePaymentBreakdown,
  toDecimal,
} from "../../common/utils/money.js";
import {
  generateInvoiceNumber,
  generateAdjustmentNumber,
} from "../../common/utils/generators.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

export interface CreateInvoiceInput {
  applicationId: string;
  clientId?: string;
  lineItems?: Array<{
    description: string;
    category?: InvoiceLineItemCategory;
    quantity: number;
    unitAmount: number | Prisma.Decimal;
    isGovernmentFee?: boolean;
    isTaxable?: boolean;
    metadata?: any;
  }>;
  governmentFee?: number | Prisma.Decimal;
  serviceFee?: number | Prisma.Decimal;
  otherFee?: number | Prisma.Decimal;
  discount?: number | Prisma.Decimal;
  tax?: number | Prisma.Decimal;
  dueAt?: Date | string;
  notes?: string;
  status?: PaymentStatus;
}

export interface UpdateDraftInvoiceInput {
  lineItems?: Array<{
    description: string;
    category?: InvoiceLineItemCategory;
    quantity: number;
    unitAmount: number | Prisma.Decimal;
    isGovernmentFee?: boolean;
    isTaxable?: boolean;
    metadata?: any;
  }>;
  discount?: number | Prisma.Decimal;
  tax?: number | Prisma.Decimal;
  dueAt?: Date | string;
  notes?: string;
}

export class InvoicesService {
  /**
   * List invoices for client with pagination and filters
   */
  async listClientInvoices(
    clientId: string,
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: PaymentStatus;
      search?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      clientId,
      organizationId,
      deletedAt: null,
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { application: { applicationNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    const [invoices, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          application: {
            select: {
              id: true,
              applicationNumber: true,
              service: {
                select: { name: true },
              },
              status: true,
            },
          },
          lineItems: true,
          receipts: {
            select: {
              id: true,
              receiptNumber: true,
              amount: true,
              issuedAt: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single invoice for client with strict ownership check
   */
  async getClientInvoiceById(id: string, clientId: string, organizationId: string) {
    const invoice = await prisma.payment.findFirst({
      where: {
        id,
        clientId,
        organizationId,
        deletedAt: null,
      },
      include: {
        application: {
          select: {
            id: true,
            applicationNumber: true,
            service: {
              select: { name: true },
            },
            status: true,
            createdAt: true,
          },
        },
        client: {
          select: {
            id: true,
            clientNumber: true,
            fullName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        lineItems: true,
        transactions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            transactionNumber: true,
            transactionType: true,
            paymentMethod: true,
            amount: true,
            currency: true,
            status: true,
            externalReference: true,
            paidAt: true,
            createdAt: true,
          },
        },
        receipts: true,
        adjustments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundError("Invoice not found or access denied");
    }

    return invoice;
  }

  /**
   * List invoices for admin with filtering, search, and pagination
   */
  async listAdminInvoices(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      clientId?: string;
      applicationId?: string;
      status?: PaymentStatus;
      isOverdue?: boolean;
      search?: string;
      fromDate?: string;
      toDate?: string;
      minAmount?: number;
      maxAmount?: number;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (params.clientId) where.clientId = params.clientId;
    if (params.applicationId) where.applicationId = params.applicationId;
    if (params.status) where.status = params.status;
    if (params.isOverdue !== undefined) where.isOverdue = params.isOverdue;

    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { client: { clientNumber: { contains: params.search, mode: "insensitive" } } },
        { application: { applicationNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    if (params.minAmount !== undefined || params.maxAmount !== undefined) {
      where.totalAmount = {};
      if (params.minAmount !== undefined) where.totalAmount.gte = new Prisma.Decimal(params.minAmount);
      if (params.maxAmount !== undefined) where.totalAmount.lte = new Prisma.Decimal(params.maxAmount);
    }

    const [invoices, total] = await Promise.all([
      prisma.payment.findMany({
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
          application: {
            select: {
              id: true,
              applicationNumber: true,
              service: {
                select: { name: true },
              },
              status: true,
            },
          },
          lineItems: true,
          receipts: {
            select: {
              id: true,
              receiptNumber: true,
              amount: true,
              issuedAt: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single invoice for admin with full financial relations
   */
  async getAdminInvoiceById(id: string, organizationId: string) {
    const invoice = await prisma.payment.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: {
        client: true,
        application: {
          select: {
            id: true,
            applicationNumber: true,
            service: {
              select: { name: true },
            },
            status: true,
            createdAt: true,
          },
        },
        lineItems: true,
        transactions: {
          orderBy: { createdAt: "desc" },
          include: {
            receipt: true,
            reversalOf: true,
            reversals: true,
          },
        },
        allocations: {
          include: {
            transaction: true,
          },
        },
        receipts: true,
        refunds: {
          include: {
            requestedBy: {
              select: { id: true, email: true },
            },
            approvedBy: {
              select: { id: true, email: true },
            },
          },
        },
        adjustments: {
          include: {
            createdBy: {
              select: { id: true, email: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }

    return invoice;
  }

  /**
   * Create an invoice with itemized line items and accurate totals
   */
  async createInvoice(
    input: CreateInvoiceInput,
    user: { id: string; organizationId: string }
  ) {
    // 1. Verify application exists
    const application = await prisma.application.findFirst({
      where: {
        id: input.applicationId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        service: true,
        client: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    const clientId = input.clientId || application.clientId;

    // 2. Determine line items and compute totals
    let lineItems = input.lineItems;
    let totals;

    if (lineItems && lineItems.length > 0) {
      totals = calculateInvoiceTotals({
        lineItems,
        discount: input.discount,
        tax: input.tax,
        amountPaid: 0,
      });
    } else {
      // Create standard line items from service pricing or inputs
      const govFee = input.governmentFee !== undefined
        ? toDecimal(input.governmentFee)
        : application.service.governmentFee;
      const srvFee = input.serviceFee !== undefined
        ? toDecimal(input.serviceFee)
        : application.service.serviceFee;
      const othFee = input.otherFee !== undefined
        ? toDecimal(input.otherFee)
        : new Prisma.Decimal(0);

      lineItems = [
        {
          description: `${application.service.name} - Government Statutory Fee`,
          category: InvoiceLineItemCategory.GOVERNMENT_FEE,
          quantity: 1,
          unitAmount: govFee,
          isGovernmentFee: true,
          isTaxable: false,
        },
        {
          description: `${application.service.name} - Swift Doc Professional Processing Fee`,
          category: InvoiceLineItemCategory.SERVICE_FEE,
          quantity: 1,
          unitAmount: srvFee,
          isGovernmentFee: false,
          isTaxable: false,
        },
      ];

      if (othFee.greaterThan(0)) {
        lineItems.push({
          description: `${application.service.name} - Additional Administrative / Filing Fee`,
          category: InvoiceLineItemCategory.OTHER,
          quantity: 1,
          unitAmount: othFee,
          isGovernmentFee: false,
          isTaxable: false,
        });
      }

      totals = calculateInvoiceTotals({
        lineItems,
        discount: input.discount,
        tax: input.tax,
        amountPaid: 0,
      });
    }

    const invoiceNumber = await generateInvoiceNumber(user.organizationId);
    const initialStatus = input.status || PaymentStatus.ISSUED;
    const parsedDueAt = input.dueAt ? new Date(input.dueAt) : null;
    const dueAt = parsedDueAt && !isNaN(parsedDueAt.getTime())
      ? parsedDueAt
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          organizationId: user.organizationId,
          clientId,
          applicationId: input.applicationId,
          invoiceNumber,
          currency: "KES",
          subtotal: totals.subtotal,
          governmentFee: totals.governmentFee,
          serviceFee: totals.serviceFee,
          otherFee: totals.otherFee,
          discount: totals.discount,
          tax: totals.tax,
          totalAmount: totals.totalAmount,
          amountPaid: new Prisma.Decimal(0),
          amountDue: totals.totalAmount,
          status: initialStatus,
          notes: input.notes || null,
          issuedAt: initialStatus === PaymentStatus.ISSUED ? new Date() : null,
          dueAt,
          lineItems: {
            create: lineItems.map((item) => ({
              organizationId: user.organizationId,
              description: item.description,
              category: item.category || InvoiceLineItemCategory.SERVICE_FEE,
              quantity: item.quantity || 1,
              unitAmount: toDecimal(item.unitAmount),
              totalAmount: calculateInvoiceTotals({
                lineItems: [item],
              }).subtotal,
              isGovernmentFee: !!item.isGovernmentFee,
              isTaxable: !!item.isTaxable,
              metadata: item.metadata || Prisma.DbNull,
            })),
          },
        },
        include: {
          lineItems: true,
          client: true,
          application: true,
        },
      });

      // Record activity in application timeline
      await tx.applicationActivity.create({
        data: {
          applicationId: input.applicationId,
          actorId: user.id,
          actorRole: UserRole.ADMIN,
          action: "INVOICE_GENERATED",
          message: `Invoice ${invoiceNumber} generated for KES ${totals.totalAmount.toString()}`,
          metadata: {
            invoiceId: created.id,
            invoiceNumber,
            totalAmount: totals.totalAmount.toString(),
            status: initialStatus,
          },
        },
      });

      return created;
    });

    // Record audit log
    await recordAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: UserRole.ADMIN,
      action: "CREATE_INVOICE",
      resource: "Payment",
      resourceId: invoice.id,
      metadata: {
        invoiceNumber,
        applicationId: input.applicationId,
        totalAmount: totals.totalAmount.toString(),
        status: initialStatus,
      },
    });

    // Notify client if issued
    if (initialStatus === PaymentStatus.ISSUED && invoice.client) {
      notificationOrchestrator
        .notifyInvoiceIssued({
          organizationId: user.organizationId,
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount.toString(),
          dueAt: invoice.dueAt?.toISOString() || null,
          applicationNumber: application.applicationNumber,
          serviceName: application.service.name,
        })
        .catch((err) => console.error("[InvoicesService] Failed to send invoice notification:", err));
    }

    return invoice;
  }

  /**
   * Update draft invoice before issuance
   */
  async updateDraftInvoice(
    id: string,
    organizationId: string,
    input: UpdateDraftInvoiceInput,
    userId: string
  ) {
    const existing = await prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lineItems: true },
    });

    if (!existing) {
      throw new NotFoundError("Invoice not found");
    }

    if (existing.status !== PaymentStatus.DRAFT && existing.status !== PaymentStatus.PENDING) {
      throw new BadRequestError("Only DRAFT or PENDING invoices can be modified");
    }

    if (existing.amountPaid.greaterThan(0)) {
      throw new BadRequestError("Cannot modify an invoice with recorded payments");
    }

    let lineItems = input.lineItems;
    let totals;

    if (lineItems && lineItems.length > 0) {
      totals = calculateInvoiceTotals({
        lineItems,
        discount: input.discount !== undefined ? input.discount : existing.discount,
        tax: input.tax !== undefined ? input.tax : existing.tax,
        amountPaid: 0,
      });
    } else {
      totals = calculatePaymentBreakdown({
        governmentFee: existing.governmentFee,
        serviceFee: existing.serviceFee,
        otherFee: existing.otherFee,
        discount: input.discount !== undefined ? input.discount : existing.discount,
        tax: input.tax !== undefined ? input.tax : existing.tax,
        amountPaid: 0,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (lineItems && lineItems.length > 0) {
        // Remove old line items
        await tx.invoiceLineItem.deleteMany({
          where: { paymentId: id },
        });

        // Insert new line items
        await tx.invoiceLineItem.createMany({
          data: lineItems.map((item) => ({
            paymentId: id,
            organizationId,
            description: item.description,
            category: item.category || InvoiceLineItemCategory.SERVICE_FEE,
            quantity: item.quantity || 1,
            unitAmount: toDecimal(item.unitAmount),
            totalAmount: calculateInvoiceTotals({
              lineItems: [item],
            }).subtotal,
            isGovernmentFee: !!item.isGovernmentFee,
            isTaxable: !!item.isTaxable,
            metadata: item.metadata || Prisma.DbNull,
          })),
        });
      }

      return tx.payment.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          governmentFee: totals.governmentFee,
          serviceFee: totals.serviceFee,
          otherFee: totals.otherFee,
          discount: totals.discount,
          tax: totals.tax,
          totalAmount: totals.totalAmount,
          amountDue: totals.totalAmount,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          dueAt: input.dueAt ? new Date(input.dueAt) : existing.dueAt,
        },
        include: {
          lineItems: true,
        },
      });
    });

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "UPDATE_INVOICE",
      resource: "Payment",
      resourceId: id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        newTotal: totals.totalAmount.toString(),
      },
    });

    return updated;
  }

  /**
   * Issue draft invoice to client
   */
  async issueInvoice(
    id: string,
    organizationId: string,
    options: { dueAt?: Date | string; notes?: string } | undefined,
    userId: string
  ) {
    const existing = await prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        client: true,
        application: {
          include: { service: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Invoice not found");
    }

    if (existing.status !== PaymentStatus.DRAFT) {
      throw new BadRequestError(`Cannot issue invoice with status '${existing.status}'. Must be DRAFT.`);
    }

    const dueAt = options?.dueAt
      ? new Date(options.dueAt)
      : existing.dueAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.ISSUED,
          issuedAt: new Date(),
          dueAt,
          notes: options?.notes || existing.notes,
        },
      });

      if (existing.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: existing.applicationId,
            actorId: userId,
            actorRole: UserRole.ADMIN,
            action: "INVOICE_ISSUED",
            message: `Invoice ${existing.invoiceNumber} formally issued to client for KES ${existing.totalAmount.toString()}`,
            metadata: {
              invoiceId: id,
              invoiceNumber: existing.invoiceNumber,
              dueAt: dueAt.toISOString(),
            },
          },
        });
      }

      return inv;
    });

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "ISSUE_INVOICE",
      resource: "Payment",
      resourceId: id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        dueAt: dueAt.toISOString(),
      },
    });

    if (existing.application) {
      notificationOrchestrator
        .notifyInvoiceIssued({
          organizationId,
          clientId: existing.clientId,
          invoiceId: existing.id,
          invoiceNumber: existing.invoiceNumber,
          totalAmount: existing.totalAmount.toString(),
          dueAt: dueAt.toISOString(),
          applicationNumber: existing.application.applicationNumber,
          serviceName: existing.application.service.name,
        })
        .catch((err) => console.error("[InvoicesService] Failed to notify invoice issuance:", err));
    }

    return updated;
  }

  /**
   * Resend / Send invoice notification to client via in-app & email
   */
  async sendInvoiceNotification(id: string, organizationId: string, userId: string) {
    const existing = await prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        client: true,
        application: {
          include: { service: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Invoice not found");
    }

    if (existing.status === PaymentStatus.DRAFT) {
      return this.issueInvoice(id, organizationId, undefined, userId);
    }

    if (existing.application) {
      await notificationOrchestrator.notifyInvoiceIssued({
        organizationId,
        clientId: existing.clientId,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        totalAmount: existing.totalAmount.toString(),
        dueAt: (existing.dueAt || new Date()).toISOString(),
        applicationNumber: existing.application.applicationNumber,
        serviceName: existing.application.service.name,
      });
    }

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "RESEND_INVOICE_NOTIFICATION",
      resource: "Payment",
      resourceId: id,
      metadata: {
        invoiceNumber: existing.invoiceNumber,
      },
    });

    return existing;
  }

  /**
   * Cancel an invoice
   */
  async cancelInvoice(
    id: string,
    organizationId: string,
    reason: string,
    userId: string
  ) {
    const existing = await prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { transactions: true },
    });

    if (!existing) {
      throw new NotFoundError("Invoice not found");
    }

    if (existing.status === PaymentStatus.CANCELLED || existing.status === PaymentStatus.VOID) {
      throw new BadRequestError("Invoice is already cancelled");
    }

    const completedTx = existing.transactions.some(
      (tx) => tx.status === PaymentStatus.COMPLETED || tx.status === PaymentStatus.PAID
    );

    if (completedTx && existing.amountPaid.greaterThan(0)) {
      throw new BadRequestError("Cannot cancel an invoice with paid transactions. Perform a refund or reversal first.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.CANCELLED,
          cancelledAt: new Date(),
          notes: existing.notes ? `${existing.notes} | Cancelled: ${reason}` : `Cancelled: ${reason}`,
        },
      });

      if (existing.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: existing.applicationId,
            actorId: userId,
            actorRole: UserRole.ADMIN,
            action: "INVOICE_CANCELLED",
            message: `Invoice ${existing.invoiceNumber} cancelled. Reason: ${reason}`,
            metadata: {
              invoiceId: id,
              invoiceNumber: existing.invoiceNumber,
              reason,
            },
          },
        });
      }

      return inv;
    });

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "CANCEL_INVOICE",
      resource: "Payment",
      resourceId: id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        reason,
      },
    });

    return updated;
  }

  /**
   * Apply financial adjustment (discount, waiver, fee addition)
   */
  async applyFinancialAdjustment(
    id: string,
    organizationId: string,
    input: {
      type: AdjustmentType;
      amount: number | Prisma.Decimal;
      reason: string;
    },
    userId: string
  ) {
    const existing = await prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { client: true, application: true },
    });

    if (!existing) {
      throw new NotFoundError("Invoice not found");
    }

    const adjustmentAmount = toDecimal(input.amount);
    if (adjustmentAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestError("Adjustment amount must be strictly greater than 0");
    }

    const adjustmentNumber = await generateAdjustmentNumber(organizationId);

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Create adjustment record
      const adj = await tx.financialAdjustment.create({
        data: {
          organizationId,
          paymentId: id,
          adjustmentNumber,
          type: input.type,
          amount: adjustmentAmount,
          reason: input.reason,
          createdById: userId,
          appliedAt: new Date(),
        },
      });

      // 2. Recalculate invoice totals based on adjustment type
      let newDiscount = existing.discount;
      let newOtherFee = existing.otherFee;
      let newTotal = existing.totalAmount;

      if (input.type === AdjustmentType.DISCOUNT || input.type === AdjustmentType.WAIVER) {
        newDiscount = existing.discount.add(adjustmentAmount);
        newTotal = existing.subtotal.add(existing.tax).sub(newDiscount);
      } else if (input.type === AdjustmentType.ADDITIONAL_CHARGE || input.type === AdjustmentType.FEE_ADJUSTMENT) {
        newOtherFee = existing.otherFee.add(adjustmentAmount);
        const newSubtotal = existing.governmentFee.add(existing.serviceFee).add(newOtherFee);
        newTotal = newSubtotal.add(existing.tax).sub(existing.discount);
      }

      if (newTotal.lessThan(0)) newTotal = new Prisma.Decimal(0);

      const newRemaining = newTotal.sub(existing.amountPaid);
      const newDue = newRemaining.lessThan(0) ? new Prisma.Decimal(0) : newRemaining;

      let newStatus = existing.status;
      if (newDue.isZero() && existing.amountPaid.greaterThan(0)) {
        newStatus = PaymentStatus.PAID;
      } else if (existing.amountPaid.greaterThan(0) && newDue.greaterThan(0)) {
        newStatus = PaymentStatus.PARTIALLY_PAID;
      }

      const inv = await tx.payment.update({
        where: { id },
        data: {
          discount: newDiscount,
          otherFee: newOtherFee,
          totalAmount: newTotal,
          amountDue: newDue,
          status: newStatus,
        },
        include: {
          adjustments: true,
          lineItems: true,
        },
      });

      if (existing.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: existing.applicationId,
            actorId: userId,
            actorRole: UserRole.ADMIN,
            action: "FINANCIAL_ADJUSTMENT_APPLIED",
            message: `Adjustment ${adjustmentNumber} (${input.type}) applied for KES ${adjustmentAmount.toString()}. New balance: KES ${newDue.toString()}`,
            metadata: {
              adjustmentId: adj.id,
              adjustmentNumber,
              type: input.type,
              amount: adjustmentAmount.toString(),
              reason: input.reason,
              newAmountDue: newDue.toString(),
            },
          },
        });
      }

      return inv;
    });

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "APPLY_FINANCIAL_ADJUSTMENT",
      resource: "Payment",
      resourceId: id,
      metadata: {
        adjustmentNumber,
        type: input.type,
        amount: adjustmentAmount.toString(),
        reason: input.reason,
      },
    });

    return updated;
  }

  /**
   * Get invoice transactions
   */
  async getInvoiceTransactions(
    invoiceId: string,
    organizationId: string,
    clientId?: string
  ) {
    const where: Prisma.PaymentTransactionWhereInput = {
      paymentId: invoiceId,
      organizationId,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    const transactions = await prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        receipt: true,
        reversalOf: true,
        reversals: true,
      },
    });

    return transactions;
  }

  /**
   * Get live status and remaining balance
   */
  async getInvoiceStatus(
    invoiceId: string,
    organizationId: string,
    clientId?: string
  ) {
    const where: Prisma.PaymentWhereInput = {
      id: invoiceId,
      organizationId,
      deletedAt: null,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    const invoice = await prisma.payment.findFirst({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        amountDue: true,
        isOverdue: true,
        dueAt: true,
        paidAt: true,
        transactions: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            transactionNumber: true,
            status: true,
            amount: true,
            paymentMethod: true,
            externalReference: true,
            paidAt: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }

    return invoice;
  }
}

export const invoicesService = new InvoicesService();
