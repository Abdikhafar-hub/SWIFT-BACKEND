import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { generateReceiptNumber } from "../../common/utils/generators.js";
import { recordAuditLog } from "../../common/utils/audit.js";

export class ReceiptsService {
  /**
   * List receipts for client with pagination
   */
  async listClientReceipts(
    clientId: string,
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ReceiptWhereInput = {
      clientId,
      organizationId,
    };

    if (params.search) {
      where.OR = [
        { receiptNumber: { contains: params.search, mode: "insensitive" } },
        { transactionReference: { contains: params.search, mode: "insensitive" } },
        { payment: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
        { application: { applicationNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.issuedAt = {};
      if (params.fromDate) where.issuedAt.gte = new Date(params.fromDate);
      if (params.toDate) where.issuedAt.lte = new Date(params.toDate);
    }

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: "desc" },
        include: {
          application: {
            select: {
              id: true,
              applicationNumber: true,
              service: {
                select: { name: true },
              },
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
              paidAt: true,
            },
          },
        },
      }),
      prisma.receipt.count({ where }),
    ]);

    return {
      data: receipts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single receipt for client with strict ownership check
   */
  async getClientReceiptById(id: string, clientId: string, organizationId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: {
        id,
        clientId,
        organizationId,
      },
      include: {
        client: {
          select: {
            id: true,
            clientNumber: true,
            fullName: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        application: {
          select: {
            id: true,
            applicationNumber: true,
            service: {
              select: { name: true },
            },
            createdAt: true,
          },
        },
        payment: {
          select: {
            id: true,
            invoiceNumber: true,
            governmentFee: true,
            serviceFee: true,
            otherFee: true,
            discount: true,
            tax: true,
            totalAmount: true,
            amountPaid: true,
            amountDue: true,
            status: true,
          },
        },
        transaction: {
          select: {
            id: true,
            transactionNumber: true,
            paymentMethod: true,
            externalReference: true,
            paidAt: true,
            currency: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundError("Receipt not found or access denied");
    }

    return receipt;
  }

  /**
   * List receipts for admin with full filters
   */
  async listAdminReceipts(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      clientId?: string;
      applicationId?: string;
      paymentId?: string;
      paymentMethod?: PaymentMethod;
      search?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ReceiptWhereInput = {
      organizationId,
    };

    if (params.clientId) where.clientId = params.clientId;
    if (params.applicationId) where.applicationId = params.applicationId;
    if (params.paymentId) where.paymentId = params.paymentId;
    if (params.paymentMethod) where.paymentMethod = params.paymentMethod;

    if (params.search) {
      where.OR = [
        { receiptNumber: { contains: params.search, mode: "insensitive" } },
        { payerName: { contains: params.search, mode: "insensitive" } },
        { transactionReference: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { client: { clientNumber: { contains: params.search, mode: "insensitive" } } },
        { payment: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
        { application: { applicationNumber: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.issuedAt = {};
      if (params.fromDate) where.issuedAt.gte = new Date(params.fromDate);
      if (params.toDate) where.issuedAt.lte = new Date(params.toDate);
    }

    const [receipts, total, grossSum, mpesaCount, bankCount] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: "desc" },
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
              paidAt: true,
            },
          },
        },
      }),
      prisma.receipt.count({ where }),
      prisma.receipt.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.receipt.count({
        where: {
          ...where,
          paymentMethod: PaymentMethod.MPESA,
        },
      }),
      prisma.receipt.count({
        where: {
          ...where,
          paymentMethod: { not: PaymentMethod.MPESA },
        },
      }),
    ]);

    const grossValue = grossSum._sum.amount ? grossSum._sum.amount.toString() : "0.00";

    return {
      data: receipts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalReceipts: total,
        mpesaReceipts: mpesaCount,
        bankReceipts: bankCount,
        grossValue,
      },
    };
  }

  /**
   * Get single receipt for admin with full relations
   */
  async getAdminReceiptById(id: string, organizationId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        client: true,
        application: true,
        payment: {
          include: {
            lineItems: true,
          },
        },
        transaction: true,
        organization: true,
      },
    });

    if (!receipt) {
      throw new NotFoundError("Receipt not found");
    }

    return receipt;
  }

  /**
   * Internal generator: Generate receipt upon confirmed transaction
   */
  async generateReceiptForTransaction(
    transactionId: string,
    organizationId: string,
    txClient?: Prisma.TransactionClient
  ) {
    const db = txClient || prisma;

    // Check if receipt already exists for this transaction
    const existing = await db.receipt.findUnique({
      where: { transactionId },
    });
    if (existing) return existing;

    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        payment: true,
        client: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError("Transaction not found");
    }

    if (transaction.status !== PaymentStatus.COMPLETED && transaction.status !== PaymentStatus.PAID) {
      throw new BadRequestError("Cannot generate receipt for non-completed transaction");
    }

    const receiptNumber = await generateReceiptNumber(organizationId);

    const receipt = await db.receipt.create({
      data: {
        organizationId,
        clientId: transaction.clientId,
        applicationId: transaction.payment.applicationId,
        paymentId: transaction.paymentId,
        transactionId,
        receiptNumber,
        amount: transaction.amount,
        currency: transaction.currency,
        paymentMethod: transaction.paymentMethod,
        transactionReference: transaction.externalReference || transaction.transactionNumber,
        payerName: transaction.client.fullName,
        amountPaid: transaction.payment.amountPaid,
        remainingBalance: transaction.payment.amountDue,
        issuedAt: transaction.paidAt || new Date(),
        metadata: {
          invoiceNumber: transaction.payment.invoiceNumber,
          transactionNumber: transaction.transactionNumber,
        },
      },
    });

    return receipt;
  }
}

export const receiptsService = new ReceiptsService();
