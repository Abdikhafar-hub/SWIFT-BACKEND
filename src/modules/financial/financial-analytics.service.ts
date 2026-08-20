import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma, PaymentStatus, RefundStatus, PaymentMethod } from "@prisma/client";

export class FinancialAnalyticsService {
  /**
   * High-level executive financial summary
   */
  async getFinancialSummary(
    organizationId: string,
    params?: { fromDate?: string; toDate?: string }
  ) {
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (params?.fromDate || params?.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    // Active invoices (excluding cancelled / void)
    const activeWhere: Prisma.PaymentWhereInput = {
      ...where,
      status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.VOID] },
    };

    const [
      aggregateStats,
      overdueStats,
      statusCounts,
      refundStats,
      recentTransactions,
    ] = await Promise.all([
      // Total Invoiced, Paid, Due
      prisma.payment.aggregate({
        where: activeWhere,
        _sum: {
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
          governmentFee: true,
          serviceFee: true,
          tax: true,
          discount: true,
        },
        _count: {
          id: true,
        },
      }),
      // Overdue statistics
      prisma.payment.aggregate({
        where: {
          ...activeWhere,
          OR: [
            { isOverdue: true },
            { status: PaymentStatus.OVERDUE },
            { dueAt: { lt: new Date() }, amountDue: { gt: 0 } },
          ],
        },
        _sum: {
          amountDue: true,
        },
        _count: {
          id: true,
        },
      }),
      // Counts grouped by status
      prisma.payment.groupBy({
        by: ["status"],
        where,
        _count: {
          id: true,
        },
      }),
      // Refund summary
      prisma.refund.aggregate({
        where: {
          organizationId,
          status: RefundStatus.COMPLETED,
          ...(params?.fromDate || params?.toDate
            ? {
                createdAt: {
                  ...(params.fromDate ? { gte: new Date(params.fromDate) } : {}),
                  ...(params.toDate ? { lte: new Date(params.toDate) } : {}),
                },
              }
            : {}),
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      }),
      // Recent successful payments
      prisma.paymentTransaction.findMany({
        where: {
          organizationId,
          status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PAID] },
        },
        orderBy: { paidAt: "desc" },
        take: 5,
        select: {
          id: true,
          transactionNumber: true,
          paymentMethod: true,
          amount: true,
          externalReference: true,
          paidAt: true,
          client: {
            select: {
              fullName: true,
              clientNumber: true,
            },
          },
          payment: {
            select: {
              invoiceNumber: true,
            },
          },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const group of statusCounts) {
      statusMap[group.status] = group._count.id;
    }

    const totalInvoiced = aggregateStats._sum.totalAmount || new Prisma.Decimal(0);
    const totalCollected = aggregateStats._sum.amountPaid || new Prisma.Decimal(0);
    const totalOutstanding = aggregateStats._sum.amountDue || new Prisma.Decimal(0);
    const totalOverdue = overdueStats._sum.amountDue || new Prisma.Decimal(0);
    const totalRefunded = refundStats._sum.amount || new Prisma.Decimal(0);

    const netRevenue = totalCollected.sub(totalRefunded);

    return {
      metrics: {
        totalInvoices: aggregateStats._count.id || 0,
        totalInvoiced: totalInvoiced.toString(),
        totalCollected: totalCollected.toString(),
        totalOutstanding: totalOutstanding.toString(),
        totalOverdue: totalOverdue.toString(),
        overdueInvoicesCount: overdueStats._count.id || 0,
        totalRefunded: totalRefunded.toString(),
        refundCount: refundStats._count.id || 0,
        netRevenue: netRevenue.toString(),
        breakdown: {
          governmentFees: (aggregateStats._sum.governmentFee || 0).toString(),
          serviceFees: (aggregateStats._sum.serviceFee || 0).toString(),
          tax: (aggregateStats._sum.tax || 0).toString(),
          discounts: (aggregateStats._sum.discount || 0).toString(),
        },
      },
      statusDistribution: {
        draft: statusMap[PaymentStatus.DRAFT] || 0,
        issued: statusMap[PaymentStatus.ISSUED] || 0,
        pending: statusMap[PaymentStatus.PENDING] || 0,
        partiallyPaid: statusMap[PaymentStatus.PARTIALLY_PAID] || 0,
        paid: (statusMap[PaymentStatus.PAID] || 0) + (statusMap[PaymentStatus.COMPLETED] || 0),
        overdue: (statusMap[PaymentStatus.OVERDUE] || 0) + (overdueStats._count.id || 0),
        partiallyRefunded: statusMap[PaymentStatus.PARTIALLY_REFUNDED] || 0,
        refunded: statusMap[PaymentStatus.REFUNDED] || 0,
        cancelled: (statusMap[PaymentStatus.CANCELLED] || 0) + (statusMap[PaymentStatus.VOID] || 0),
      },
      recentTransactions,
    };
  }

  /**
   * Collections breakdown by payment method and timeline
   */
  async getCollectionsAnalytics(
    organizationId: string,
    params?: {
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const where: Prisma.PaymentTransactionWhereInput = {
      organizationId,
      status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PAID] },
    };

    if (params?.fromDate || params?.toDate) {
      where.paidAt = {};
      if (params.fromDate) where.paidAt.gte = new Date(params.fromDate);
      if (params.toDate) where.paidAt.lte = new Date(params.toDate);
    }

    // Group by payment method
    const methodGroups = await prisma.paymentTransaction.groupBy({
      by: ["paymentMethod"],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    });

    const methodBreakdown = methodGroups.map((g) => ({
      method: g.paymentMethod,
      totalAmount: (g._sum.amount || new Prisma.Decimal(0)).toString(),
      transactionCount: g._count.id,
    }));

    return {
      collectionsByMethod: methodBreakdown,
    };
  }

  /**
   * Outstanding and aging invoices list
   */
  async getOutstandingInvoices(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      agingBucket?: "1-7" | "8-14" | "15-30" | "30+";
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const now = new Date();
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null,
      amountDue: { gt: 0 },
      status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.VOID] },
    };

    const [invoices, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueAt: "asc" },
        include: {
          client: {
            select: {
              id: true,
              clientNumber: true,
              fullName: true,
              phone: true,
              email: true,
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
        },
      }),
      prisma.payment.count({ where }),
    ]);

    // Enhance with aging calculations
    const enhanced = invoices.map((inv) => {
      const dueDate = inv.dueAt || inv.createdAt;
      const diffMs = now.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let agingBucket = "Current";
      if (diffDays > 30) agingBucket = "30+ days";
      else if (diffDays > 14) agingBucket = "15-30 days";
      else if (diffDays > 7) agingBucket = "8-14 days";
      else if (diffDays > 0) agingBucket = "1-7 days";

      return {
        ...inv,
        daysOverdue: Math.max(0, diffDays),
        isOverdue: diffDays > 0,
        agingBucket,
      };
    });

    // Filter by requested bucket if provided
    const filtered = params.agingBucket
      ? enhanced.filter((e) => e.agingBucket.includes(params.agingBucket!))
      : enhanced;

    return {
      data: filtered,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Overdue invoices requiring action
   */
  async getOverdueInvoices(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const now = new Date();
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      deletedAt: null,
      amountDue: { gt: 0 },
      OR: [
        { isOverdue: true },
        { status: PaymentStatus.OVERDUE },
        { dueAt: { lt: now } },
      ],
    };

    const [invoices, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueAt: "asc" },
        include: {
          client: {
            select: {
              id: true,
              clientNumber: true,
              fullName: true,
              phone: true,
              email: true,
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
}

export const financialAnalyticsService = new FinancialAnalyticsService();
