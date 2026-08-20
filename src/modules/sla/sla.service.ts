import { prisma } from "../../infrastructure/database/prisma.js";
import {
  ApplicationStatus,
  SlaStatus,
  NoteVisibility,
  UserRole,
  SlaEventCategory,
  SlaEventType,
} from "@prisma/client";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";

export interface SlaEvaluationResult {
  currentStatus: SlaStatus;
  isOverdue: boolean;
  isAtRisk: boolean;
  remainingHours: number;
  elapsedHours: number;
  totalPausedDurationMinutes: number;
  isPaused: boolean;
}

export interface SlaTimingBreakdown {
  applicationId: string;
  applicationNumber: string;
  slaTargetHours: number;
  totalElapsedHours: number;
  activeProcessingHours: number;
  clientWaitingHours: number;
  governmentWaitingHours: number;
  internalPausedHours: number;
  isPaused: boolean;
  slaStatus: SlaStatus;
  dueAt: Date | null;
  startedAt: Date;
  events: Array<{
    id: string;
    eventType: SlaEventType;
    category: SlaEventCategory;
    startedAt: Date;
    endedAt: Date | null;
    durationMinutes: number;
    reason: string | null;
    actorRole: UserRole | null;
  }>;
}

export class SlaService {
  /**
   * Evaluate SLA status for a given application
   */
  evaluateApplicationSla(app: {
    status: ApplicationStatus;
    startedAt: Date;
    dueAt: Date | null;
    pausedAt: Date | null;
    totalPausedDuration: number;
    completedAt?: Date | null;
  }): SlaEvaluationResult {
    const now = new Date();
    const isPaused = Boolean(app.pausedAt || app.status === ApplicationStatus.ON_HOLD);

    // 1. Completed
    if (
      app.status === ApplicationStatus.DELIVERED ||
      app.status === ApplicationStatus.CLOSED ||
      app.completedAt
    ) {
      const completionDate = app.completedAt || now;
      const isOverdue = app.dueAt ? completionDate.getTime() > app.dueAt.getTime() : false;
      return {
        currentStatus: isOverdue ? SlaStatus.OVERDUE : SlaStatus.COMPLETED,
        isOverdue,
        isAtRisk: false,
        remainingHours: 0,
        elapsedHours: Math.max(0, (completionDate.getTime() - app.startedAt.getTime()) / (1000 * 60 * 60)),
        totalPausedDurationMinutes: app.totalPausedDuration,
        isPaused: false,
      };
    }

    // 2. On Hold / Paused
    if (isPaused) {
      return {
        currentStatus: SlaStatus.ON_TRACK,
        isOverdue: false,
        isAtRisk: false,
        remainingHours: app.dueAt ? Math.max(0, (app.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : 0,
        elapsedHours: Math.max(0, (now.getTime() - app.startedAt.getTime()) / (1000 * 60 * 60)),
        totalPausedDurationMinutes: app.totalPausedDuration,
        isPaused: true,
      };
    }

    // 3. Active Applications
    if (!app.dueAt) {
      return {
        currentStatus: SlaStatus.ON_TRACK,
        isOverdue: false,
        isAtRisk: false,
        remainingHours: 999,
        elapsedHours: Math.max(0, (now.getTime() - app.startedAt.getTime()) / (1000 * 60 * 60)),
        totalPausedDurationMinutes: app.totalPausedDuration,
        isPaused: false,
      };
    }

    const remainingMs = app.dueAt.getTime() - now.getTime();
    const remainingHours = remainingMs / (1000 * 60 * 60);
    const elapsedHours = (now.getTime() - app.startedAt.getTime()) / (1000 * 60 * 60);

    if (remainingMs < 0) {
      return {
        currentStatus: SlaStatus.OVERDUE,
        isOverdue: true,
        isAtRisk: true,
        remainingHours: Math.floor(remainingHours),
        elapsedHours,
        totalPausedDurationMinutes: app.totalPausedDuration,
        isPaused: false,
      };
    }

    // At risk if <= 24 hours remaining
    if (remainingHours <= 24) {
      return {
        currentStatus: SlaStatus.AT_RISK,
        isOverdue: false,
        isAtRisk: true,
        remainingHours: Math.round(remainingHours * 10) / 10,
        elapsedHours,
        totalPausedDurationMinutes: app.totalPausedDuration,
        isPaused: false,
      };
    }

    return {
      currentStatus: SlaStatus.ON_TRACK,
      isOverdue: false,
      isAtRisk: false,
      remainingHours: Math.round(remainingHours * 10) / 10,
      elapsedHours,
      totalPausedDurationMinutes: app.totalPausedDuration,
      isPaused: false,
    };
  }

  /**
   * Pause Application SLA manually or operationally
   */
  async pauseSla(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    category: SlaEventCategory = SlaEventCategory.INTERNAL,
    reason: string
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    if (app.pausedAt) {
      throw new BadRequestError("Application SLA is already paused");
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: {
          pausedAt: now,
          status: app.status === ApplicationStatus.GOVERNMENT_PROCESSING ? ApplicationStatus.ON_HOLD : app.status,
        },
      });

      // Record SLA event
      await tx.applicationSlaEvent.create({
        data: {
          applicationId,
          eventType: SlaEventType.PAUSED,
          category,
          startedAt: now,
          reason,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      // Activity
      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "SLA_PAUSED",
          entityType: "Application",
          entityId: applicationId,
          message: `SLA timer paused (${category}): ${reason}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return updatedApp;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "SLA_PAUSED",
      resource: "Application",
      resourceId: applicationId,
      metadata: { category, reason },
    });

    return updated;
  }

  /**
   * Resume Application SLA and extend due date by the paused duration
   */
  async resumeSla(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    reason?: string
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    if (!app.pausedAt) {
      throw new BadRequestError("Application SLA is not paused");
    }

    const now = new Date();
    const pausedMs = now.getTime() - app.pausedAt.getTime();
    const pausedMinutes = Math.max(1, Math.round(pausedMs / (1000 * 60)));

    // New due date extended by paused minutes
    const newDueAt = app.dueAt ? new Date(app.dueAt.getTime() + pausedMs) : null;
    const newTotalPausedDuration = app.totalPausedDuration + pausedMinutes;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Close open pause SLA event
      const openPauseEvent = await tx.applicationSlaEvent.findFirst({
        where: { applicationId, eventType: SlaEventType.PAUSED, endedAt: null },
        orderBy: { createdAt: "desc" },
      });

      if (openPauseEvent) {
        await tx.applicationSlaEvent.update({
          where: { id: openPauseEvent.id },
          data: {
            endedAt: now,
            durationMinutes: pausedMinutes,
          },
        });
      }

      // 2. Create RESUMED SLA event
      await tx.applicationSlaEvent.create({
        data: {
          applicationId,
          eventType: SlaEventType.RESUMED,
          category: SlaEventCategory.INTERNAL,
          startedAt: now,
          durationMinutes: 0,
          reason: reason || "SLA timer resumed",
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      // 3. Update application
      const updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: {
          pausedAt: null,
          dueAt: newDueAt,
          totalPausedDuration: newTotalPausedDuration,
          status: app.status === ApplicationStatus.ON_HOLD ? ApplicationStatus.GOVERNMENT_PROCESSING : app.status,
        },
      });

      // 4. Activity
      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "SLA_RESUMED",
          entityType: "Application",
          entityId: applicationId,
          message: `SLA timer resumed after ${pausedMinutes} minutes pause. Due date extended to ${newDueAt ? newDueAt.toISOString() : "N/A"}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return updatedApp;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "SLA_RESUMED",
      resource: "Application",
      resourceId: applicationId,
      metadata: { pausedMinutes, newDueAt, reason },
    });

    return updated;
  }

  /**
   * Get detailed timing breakdown and event timeline for an application
   */
  async getApplicationSlaTimeline(applicationId: string, organizationId: string): Promise<SlaTimingBreakdown> {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        service: true,
        slaEvents: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!app) throw new NotFoundError("Application");

    const now = new Date();
    const totalElapsedMinutes = Math.max(0, Math.round((now.getTime() - app.startedAt.getTime()) / (1000 * 60)));

    let clientWaitingMinutes = 0;
    let govWaitingMinutes = 0;
    let internalPausedMinutes = 0;

    for (const evt of app.slaEvents) {
      const dur = evt.durationMinutes || (evt.endedAt ? Math.round((evt.endedAt.getTime() - evt.startedAt.getTime()) / (1000 * 60)) : 0);
      if (evt.category === SlaEventCategory.CLIENT_WAITING) {
        clientWaitingMinutes += dur;
      } else if (evt.category === SlaEventCategory.GOVERNMENT_WAITING) {
        govWaitingMinutes += dur;
      } else if (evt.eventType === SlaEventType.PAUSED) {
        internalPausedMinutes += dur;
      }
    }

    // If currently paused, add open pause duration to breakdown
    if (app.pausedAt) {
      const currentPauseMins = Math.round((now.getTime() - app.pausedAt.getTime()) / (1000 * 60));
      internalPausedMinutes += currentPauseMins;
    }

    const totalNonActiveMinutes = clientWaitingMinutes + govWaitingMinutes + internalPausedMinutes;
    const activeProcessingMinutes = Math.max(0, totalElapsedMinutes - totalNonActiveMinutes);

    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      slaTargetHours: app.service.slaHours,
      totalElapsedHours: Math.round((totalElapsedMinutes / 60) * 10) / 10,
      activeProcessingHours: Math.round((activeProcessingMinutes / 60) * 10) / 10,
      clientWaitingHours: Math.round((clientWaitingMinutes / 60) * 10) / 10,
      governmentWaitingHours: Math.round((govWaitingMinutes / 60) * 10) / 10,
      internalPausedHours: Math.round((internalPausedMinutes / 60) * 10) / 10,
      isPaused: Boolean(app.pausedAt),
      slaStatus: app.slaStatus,
      dueAt: app.dueAt,
      startedAt: app.startedAt,
      events: app.slaEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        category: e.category,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        durationMinutes: e.durationMinutes,
        reason: e.reason,
        actorRole: e.actorRole,
      })),
    };
  }

  /**
   * Automated SLA Sweep across all active applications
   */
  async performSlaSweep(organizationId?: string) {
    const where: any = {
      deletedAt: null,
      status: {
        notIn: [ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED],
      },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const activeApps = await prisma.application.findMany({
      where,
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    let updatedCount = 0;
    let alertsSent = 0;

    for (const app of activeApps) {
      const evaluation = this.evaluateApplicationSla(app);

      if (evaluation.currentStatus !== app.slaStatus) {
        // Status has shifted
        await prisma.application.update({
          where: { id: app.id },
          data: { slaStatus: evaluation.currentStatus },
        });
        updatedCount++;

        // Log activity if degraded
        if (
          evaluation.currentStatus === SlaStatus.AT_RISK ||
          evaluation.currentStatus === SlaStatus.OVERDUE
        ) {
          await prisma.applicationActivity.create({
            data: {
              applicationId: app.id,
              action: `SLA_${evaluation.currentStatus}`,
              entityType: "Application",
              entityId: app.id,
              message: `Application SLA status updated to ${evaluation.currentStatus} (${Math.abs(evaluation.remainingHours)} hours ${evaluation.isOverdue ? "past deadline" : "remaining"})`,
              visibility: NoteVisibility.CLIENT_VISIBLE,
            },
          });

          // Dispatch multi-channel alert
          if (app.client.user) {
            const ctx: BaseNotificationContext = {
              organizationId: app.organizationId,
              applicationId: app.id,
              applicationNumber: app.applicationNumber,
              serviceName: app.service.name,
              clientUserId: app.client.user.id,
              clientName: app.client.fullName,
              clientEmail: app.client.email,
              clientPhone: app.client.phone,
            };

            await notificationOrchestrator.notifySlaAlert(ctx, {
              alertType: evaluation.isOverdue ? "OVERDUE" : "WARNING",
              remainingHours: evaluation.isOverdue ? 0 : Math.ceil(evaluation.remainingHours),
            });
            alertsSent++;
          }
        }
      }
    }

    return {
      evaluatedCount: activeApps.length,
      updatedCount,
      alertsSent,
      timestamp: new Date(),
    };
  }

  /**
   * Operational SLA Performance Metrics
   */
  async getSlaMetrics(organizationId: string) {
    const [totalApps, onTrack, atRisk, overdue, completed] = await Promise.all([
      prisma.application.count({ where: { organizationId, deletedAt: null } }),
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          slaStatus: SlaStatus.ON_TRACK,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          slaStatus: SlaStatus.AT_RISK,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          slaStatus: SlaStatus.OVERDUE,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
        },
      }),
      prisma.application.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: [ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED] },
        },
      }),
    ]);

    const activeTotal = onTrack + atRisk + overdue;
    const slaComplianceRate =
      activeTotal > 0 ? Math.round((onTrack / activeTotal) * 100) : 100;

    return {
      totalApplications: totalApps,
      activeApplications: activeTotal,
      onTrack,
      atRisk,
      overdue,
      completed,
      slaComplianceRate,
    };
  }
}

export const slaService = new SlaService();
