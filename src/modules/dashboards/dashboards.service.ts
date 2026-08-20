import { prisma } from "../../infrastructure/database/prisma.js";
import { ApplicationStatus, SlaStatus, PaymentStatus, NoteVisibility } from "@prisma/client";
import { toDecimal } from "../../common/utils/money.js";
import { slaService } from "../sla/sla.service.js";

export class DashboardsService {
  /**
   * Admin Operational Executive Overview
   */
  async getAdminOverview(organizationId: string) {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [
      totalApplications,
      totalClients,
      newRegistrationsCount,
      statusGroups,
      unassignedCount,
      overdueCount,
      dueSoonCount,
      qualityCheckCount,
      governmentProcessingCount,
      financialAggregates,
      slaMetrics,
      recentActivities,
      governmentAgencyStats,
    ] = await Promise.all([
      // Total apps
      prisma.application.count({ where: { organizationId, deletedAt: null } }),

      // Total clients
      prisma.client.count({ where: { organizationId, deletedAt: null } }),

      // New unreviewed registrations
      prisma.client.count({ where: { organizationId, deletedAt: null, isReviewed: false } }),

      // Status breakdown
      prisma.application.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: { id: true },
      }),

      // Unassigned
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          assignedAdminId: null,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),

      // Overdue
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          slaStatus: SlaStatus.OVERDUE,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),

      // Due soon (< 24h)
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          dueAt: { lte: in24Hours, gte: now },
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),

      // Quality check queue
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          status: ApplicationStatus.QUALITY_CHECK,
        },
      }),

      // Government processing queue
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.GOVERNMENT_PROCESSING] },
        },
      }),

      // Payments aggregates
      prisma.payment.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: {
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
        },
      }),

      // SLA metrics
      slaService.getSlaMetrics(organizationId),

      // Recent 10 activities
      prisma.applicationActivity.findMany({
        where: { application: { organizationId } },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          application: {
            select: { applicationNumber: true, client: { select: { fullName: true } } },
          },
        },
      }),

      // Government agencies breakdown
      prisma.governmentApplication.groupBy({
        by: ["governmentAgency"],
        where: { application: { organizationId } },
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const group of statusGroups) {
      statusCounts[group.status] = group._count.id;
    }

    return {
      summary: {
        totalApplications,
        totalClients,
        activeApplications: (totalApplications || 0) - (statusCounts[ApplicationStatus.DELIVERED] || 0) - (statusCounts[ApplicationStatus.CLOSED] || 0) - (statusCounts[ApplicationStatus.CANCELLED] || 0),
        statusCounts,
      },
      queues: {
        newRegistrations: newRegistrationsCount,
        unassigned: unassignedCount,
        overdue: overdueCount,
        dueSoon: dueSoonCount,
        qualityCheck: qualityCheckCount,
        awaitingGovernment: governmentProcessingCount,
      },
      financials: {
        totalInvoiced: financialAggregates._sum.totalAmount?.toString() || "0.00",
        totalCollected: financialAggregates._sum.amountPaid?.toString() || "0.00",
        totalOutstanding: financialAggregates._sum.amountDue?.toString() || "0.00",
      },
      sla: slaMetrics,
      governmentAgencyStats: governmentAgencyStats.map((g) => ({
        agency: g.governmentAgency,
        count: g._count.id,
      })),
      recentActivities: recentActivities.map((act) => ({
        id: act.id,
        applicationNumber: act.application.applicationNumber,
        clientName: act.application.client.fullName,
        action: act.action,
        message: act.message,
        timestamp: act.createdAt,
      })),
    };
  }

  /**
   * Client Portal Overview Dashboard
   */
  async getClientOverview(organizationId: string, clientId: string) {
    const [totalApplications, activeApps, recentInvoices, unreadNotificationsCount] = await Promise.all([
      prisma.application.count({ where: { organizationId, clientId, deletedAt: null } }),
      prisma.application.findMany({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          service: { select: { name: true, code: true } },
          requirements: { select: { isSatisfied: true } },
          documents: { where: { deletedAt: null }, select: { status: true } },
        },
      }),
      prisma.payment.findMany({
        where: { organizationId, clientId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.notification.count({
        where: {
          organizationId,
          client: { id: clientId },
          status: { not: "READ" as any },
        },
      }),
    ]);

    const activeApplicationsFormatted = activeApps.map((app) => {
      const totalReqs = app.requirements.length;
      const satisfiedReqs = app.requirements.filter((r) => r.isSatisfied).length;
      const progressPercent = totalReqs > 0 ? Math.round((satisfiedReqs / totalReqs) * 100) : 100;

      return {
        id: app.id,
        applicationNumber: app.applicationNumber,
        serviceName: app.service.name,
        status: app.status,
        slaStatus: app.slaStatus,
        dueAt: app.dueAt,
        progressPercent,
        paidAmount: app.paidAmount.toString(),
        dueAmount: app.dueAmount.toString(),
        createdAt: app.createdAt,
      };
    });

    return {
      totalApplications,
      unreadNotificationsCount,
      activeApplications: activeApplicationsFormatted,
      recentInvoices: recentInvoices.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoiceNumber,
        totalAmount: p.totalAmount.toString(),
        amountPaid: p.amountPaid.toString(),
        amountDue: p.amountDue.toString(),
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }
}

export const dashboardsService = new DashboardsService();
