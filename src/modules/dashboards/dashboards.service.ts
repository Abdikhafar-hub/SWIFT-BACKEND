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
  /**
   * Client Portal Executive Overview Dashboard (Authoritative Data)
   */
  async getClientOverview(organizationId: string, clientId: string) {
    const now = new Date();

    // Resolve client profile details
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      select: { id: true, fullName: true, businessName: true, email: true, phone: true },
    });

    const [
      totalApplications,
      activeApps,
      clientActions,
      allRequirements,
      unreadNotificationsCount,
      recentActivities,
      recentPayments,
    ] = await Promise.all([
      // 1. Total applications count
      prisma.application.count({ where: { organizationId, clientId, deletedAt: null } }),

      // 2. Active applications (not CLOSED or CANCELLED)
      prisma.application.findMany({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED] },
        },
        orderBy: { createdAt: "desc" },
        include: {
          service: { select: { name: true, code: true } },
          requirements: { select: { isSatisfied: true, status: true } },
        },
      }),

      // 3. Open client actions
      prisma.clientAction.findMany({
        where: {
          organizationId,
          application: { clientId },
          status: "OPEN",
        },
        orderBy: { dueAt: "asc" },
        include: {
          application: { select: { applicationNumber: true, service: { select: { name: true } } } },
        },
      }),

      // 4. All requirements for compliance health calculation
      prisma.applicationRequirement.findMany({
        where: { application: { organizationId, clientId, deletedAt: null } },
        select: { id: true, isSatisfied: true, status: true },
      }),

      // 5. Unread notifications count
      prisma.notification.count({
        where: {
          organizationId,
          client: { id: clientId },
          status: { not: "READ" as any },
        },
      }),

      // 6. Recent application activities (visible to client)
      prisma.applicationActivity.findMany({
        where: {
          application: { organizationId, clientId, deletedAt: null },
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          application: {
            select: {
              applicationNumber: true,
              service: { select: { name: true } },
            },
          },
        },
      }),

      // 7. Recent payments/invoices
      prisma.payment.findMany({
        where: { organizationId, clientId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    // A. Calculate Active Filings Progress
    let totalReqCount = 0;
    let satisfiedReqCount = 0;
    activeApps.forEach((app) => {
      app.requirements.forEach((req) => {
        totalReqCount++;
        if (req.isSatisfied) satisfiedReqCount++;
      });
    });
    const activeFilingsProgressPercent = totalReqCount > 0 ? Math.round((satisfiedReqCount / totalReqCount) * 100) : 100;

    // B. Calculate Compliance Health Breakdown
    let compliantCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let attentionCount = 0;

    allRequirements.forEach((r) => {
      if (r.isSatisfied) {
        compliantCount++;
      } else if (r.status === "SUBMITTED" || r.status === "UNDER_REVIEW") {
        pendingCount++;
      } else if (r.status === "REJECTED" || r.status === "CORRECTION_REQUIRED") {
        attentionCount++;
      } else {
        pendingCount++;
      }
    });

    // Check overdue applications/actions
    activeApps.forEach((app) => {
      if (app.dueAt && app.dueAt < now) {
        overdueCount++;
      }
    });

    const totalEvaluated = allRequirements.length || 1;
    const complianceScorePercent = Math.min(100, Math.round((compliantCount / totalEvaluated) * 100));

    // C. Generate 6-Month Timeline Aggregation for Filing Overview Chart
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const chartTimeline = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = monthNames[d.getMonth()];
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      // Filings active in this month
      const activeInMonth = activeApps.filter(a => a.createdAt <= monthEnd).length;
      const completedInMonth = activeApps.filter(a => a.status === ApplicationStatus.DELIVERED && a.updatedAt >= monthStart && a.updatedAt <= monthEnd).length;
      const actionItemsInMonth = clientActions.filter(ca => ca.createdAt >= monthStart && ca.createdAt <= monthEnd).length;
      const rejectedInMonth = allRequirements.filter(r => r.status === "REJECTED").length;

      chartTimeline.push({
        month: mName,
        activeFilings: activeInMonth,
        completed: completedInMonth,
        actionItems: actionItemsInMonth,
        rejected: rejectedInMonth,
      });
    }

    // D. Upcoming Deadlines
    const upcomingDeadlines: any[] = [];
    // From active applications dueAt
    activeApps.forEach((app) => {
      if (app.dueAt) {
        const diffMs = app.dueAt.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const dayStr = app.dueAt.getDate().toString().padStart(2, "0");
        const monthStr = monthNames[app.dueAt.getMonth()].toUpperCase();

        upcomingDeadlines.push({
          id: app.id,
          day: dayStr,
          month: monthStr,
          title: app.service.name,
          companyName: client?.businessName || client?.fullName || "Swift Doc Client",
          daysLeft: daysLeft > 0 ? `${daysLeft} days left` : "Due today",
          rawDate: app.dueAt,
          badgeColor: daysLeft <= 7 ? "AMBER" : daysLeft <= 30 ? "BLUE" : "GREEN",
        });
      }
    });

    // From client actions dueAt
    clientActions.forEach((ca) => {
      if (ca.dueAt) {
        const diffMs = ca.dueAt.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const dayStr = ca.dueAt.getDate().toString().padStart(2, "0");
        const monthStr = monthNames[ca.dueAt.getMonth()].toUpperCase();

        upcomingDeadlines.push({
          id: ca.id,
          day: dayStr,
          month: monthStr,
          title: ca.title,
          companyName: ca.application.service.name,
          daysLeft: daysLeft > 0 ? `${daysLeft} days left` : "Overdue",
          rawDate: ca.dueAt,
          badgeColor: daysLeft <= 3 ? "ROSE" : "AMBER",
        });
      }
    });

    upcomingDeadlines.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

    // E. Formatted Recent Activity Feed
    const formattedActivities = recentActivities.map((act) => ({
      id: act.id,
      title: act.action === "DOCUMENT_UPLOADED" ? "Document Uploaded" : act.action === "DOCUMENT_APPROVED" ? "Document Approved" : act.action === "DOCUMENT_REJECTED" ? "Document Rejected" : act.message,
      subtitle: `${act.application.service.name} (${act.application.applicationNumber})`,
      timestamp: act.createdAt,
      type: act.action.includes("APPROVED") ? "APPROVED" : act.action.includes("REJECTED") ? "REJECTED" : act.action.includes("PAYMENT") ? "PAYMENT" : "NOTICE",
    }));

    return {
      client: {
        id: client?.id || clientId,
        fullName: client?.fullName || "Client",
        businessName: client?.businessName || "",
        email: client?.email || "",
      },
      summary: {
        totalApplications,
        activeFilingsCount: activeApps.length,
        actionItemsCount: clientActions.length,
        unreadNotificationsCount,
        activeFilingsProgressPercent,
      },
      chartTimeline,
      recentActivity: formattedActivities,
      upcomingDeadlines: upcomingDeadlines.slice(0, 5),
      complianceHealth: {
        scorePercent: complianceScorePercent,
        compliantCount,
        pendingCount,
        overdueCount,
        attentionCount,
      },
      activeApplications: activeApps.map((a) => ({
        id: a.id,
        applicationNumber: a.applicationNumber,
        serviceName: a.service.name,
        status: a.status,
        createdAt: a.createdAt,
      })),
      recentInvoices: recentPayments.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoiceNumber,
        totalAmount: p.totalAmount.toString(),
        amountPaid: p.amountPaid.toString(),
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }
}

export const dashboardsService = new DashboardsService();
