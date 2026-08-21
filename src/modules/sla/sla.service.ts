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
   * Fetch paginated SLA records with multi-criteria filtering
   */
  async getSlaRecords(
    organizationId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      slaStatus?: string;
      priority?: string;
      serviceId?: string;
      dateRange?: string;
      startDate?: string;
      endDate?: string;
      viewMode?: "ACTIVE" | "HISTORICAL" | "ALL";
    }
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 15;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (query.viewMode === "ACTIVE") {
      where.status = { notIn: [ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED] };
    } else if (query.viewMode === "HISTORICAL") {
      where.status = { in: [ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED] };
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { applicationNumber: { contains: term, mode: "insensitive" } },
        { client: { fullName: { contains: term, mode: "insensitive" } } },
        { client: { email: { contains: term, mode: "insensitive" } } },
        { service: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    if (query.slaStatus) {
      if (query.slaStatus === "PAUSED") {
        where.pausedAt = { not: null };
      } else if (query.slaStatus === "BREACHED" || query.slaStatus === "OVERDUE") {
        where.slaStatus = SlaStatus.OVERDUE;
        where.pausedAt = null;
      } else if (query.slaStatus === "COMPLETED") {
        where.status = { in: [ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED] };
      } else if (query.slaStatus === "ON_TRACK" || query.slaStatus === "AT_RISK") {
        where.slaStatus = query.slaStatus as SlaStatus;
        where.pausedAt = null;
      }
    }

    if (query.priority) {
      where.priority = query.priority as any;
    }

    if (query.serviceId) {
      where.serviceId = query.serviceId;
    }

    if (query.dateRange) {
      const now = new Date();
      if (query.dateRange === "TODAY") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        where.createdAt = { gte: startOfDay };
      } else if (query.dateRange === "LAST_7_DAYS") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        where.createdAt = { gte: d };
      } else if (query.dateRange === "LAST_30_DAYS") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        where.createdAt = { gte: d };
      } else if (query.dateRange === "CUSTOM" && (query.startDate || query.endDate)) {
        where.createdAt = {};
        if (query.startDate) where.createdAt.gte = new Date(query.startDate);
        if (query.endDate) where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { id: true, fullName: true, email: true, phone: true, businessName: true } },
          service: { select: { id: true, name: true, code: true, slaHours: true } },
          assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
          slaEvents: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      }),
    ]);

    const now = new Date();

    const formattedItems = items.map((app) => {
      const isPaused = Boolean(app.pausedAt || app.status === ApplicationStatus.ON_HOLD);
      const isCompleted = app.status === ApplicationStatus.DELIVERED || app.status === ApplicationStatus.CLOSED || Boolean(app.completedAt);
      
      let effectiveSlaState: string = app.slaStatus;
      if (isCompleted) {
        effectiveSlaState = "COMPLETED";
      } else if (isPaused) {
        effectiveSlaState = "PAUSED";
      } else if (app.slaStatus === SlaStatus.OVERDUE) {
        effectiveSlaState = "BREACHED";
      }

      let remainingMs = 0;
      if (app.dueAt) {
        remainingMs = app.dueAt.getTime() - now.getTime();
      }

      return {
        ...app,
        effectiveSlaState,
        isPaused,
        isCompleted,
        remainingMs,
        slaDueAt: app.dueAt,
        assignedAdmin: app.assignedAdmin
          ? {
              ...app.assignedAdmin,
              fullName: `${app.assignedAdmin.firstName || ""} ${app.assignedAdmin.lastName || ""}`.trim() || app.assignedAdmin.email,
            }
          : null,
      };
    });

    return {
      items: formattedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create Manual SLA Entry
   */
  async createManualSlaEntry(
    organizationId: string,
    adminId: string,
    adminEmail: string,
    payload: {
      applicationId: string;
      slaType: string;
      durationValue: number;
      durationUnit: "DAYS" | "HOURS" | "MINUTES";
      startedAt: string;
      dueAt: string;
      isManualDueDateOverride?: boolean;
      priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
      initialSlaState: "ON_TRACK" | "AT_RISK" | "PAUSED" | "BREACHED";
      reason: string;
    }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: payload.applicationId, organizationId, deletedAt: null },
      include: { client: true, service: true },
    });

    if (!app) throw new NotFoundError("Application");

    const startDate = new Date(payload.startedAt);
    const dueDate = new Date(payload.dueAt);

    if (dueDate.getTime() <= startDate.getTime()) {
      throw new BadRequestError("Due date cannot be before or equal to start date");
    }

    let dbSlaStatus: SlaStatus = SlaStatus.ON_TRACK;
    if (payload.initialSlaState === "AT_RISK") dbSlaStatus = SlaStatus.AT_RISK;
    if (payload.initialSlaState === "BREACHED") dbSlaStatus = SlaStatus.OVERDUE;

    const isPaused = payload.initialSlaState === "PAUSED";
    const now = new Date();

    const updatedApp = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: app.id },
        data: {
          startedAt: startDate,
          dueAt: dueDate,
          priority: payload.priority as any,
          slaStatus: dbSlaStatus,
          pausedAt: isPaused ? now : null,
        },
      });

      await tx.applicationSlaEvent.create({
        data: {
          applicationId: app.id,
          eventType: SlaEventType.STARTED,
          category: SlaEventCategory.INTERNAL,
          startedAt: startDate,
          reason: `Manual SLA creation (${payload.slaType}): ${payload.reason}`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          metadata: {
            slaType: payload.slaType,
            durationValue: payload.durationValue,
            durationUnit: payload.durationUnit,
            isManualDueDateOverride: payload.isManualDueDateOverride || false,
            initialSlaState: payload.initialSlaState,
          },
        },
      });

      if (isPaused) {
        await tx.applicationSlaEvent.create({
          data: {
            applicationId: app.id,
            eventType: SlaEventType.PAUSED,
            category: SlaEventCategory.INTERNAL,
            startedAt: now,
            reason: `Initial state set to PAUSED: ${payload.reason}`,
            actorId: adminId,
            actorRole: UserRole.ADMIN,
          },
        });
      }

      await tx.applicationActivity.create({
        data: {
          applicationId: app.id,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "SLA_MANUALLY_CREATED",
          entityType: "Application",
          entityId: app.id,
          message: `Manual SLA record initialized (${payload.slaType}) due on ${dueDate.toISOString()}. Reason: ${payload.reason}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return updated;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "SLA_MANUALLY_CREATED",
      resource: "Application",
      resourceId: app.id,
      metadata: {
        applicationNumber: app.applicationNumber,
        slaType: payload.slaType,
        startedAt: payload.startedAt,
        dueAt: payload.dueAt,
        priority: payload.priority,
        initialSlaState: payload.initialSlaState,
        reason: payload.reason,
      },
    });

    return updatedApp;
  }

  /**
   * Modify SLA parameters (priority, due date, duration, notes)
   */
  async updateSlaRecord(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    payload: {
      priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
      slaHours?: number;
      dueAt?: string;
      reason: string;
    }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    const oldPriority = app.priority;
    const oldDueAt = app.dueAt;

    const dataToUpdate: any = {};
    if (payload.priority) dataToUpdate.priority = payload.priority;
    if (payload.dueAt) dataToUpdate.dueAt = new Date(payload.dueAt);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.application.update({
        where: { id: applicationId },
        data: dataToUpdate,
      });

      await tx.applicationSlaEvent.create({
        data: {
          applicationId,
          eventType: SlaEventType.EXTENSION,
          category: SlaEventCategory.INTERNAL,
          reason: payload.reason,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          metadata: {
            oldPriority,
            newPriority: payload.priority,
            oldDueAt,
            newDueAt: payload.dueAt,
          },
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "SLA_UPDATED",
          entityType: "Application",
          entityId: applicationId,
          message: `SLA parameters updated. Reason: ${payload.reason}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return res;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: payload.dueAt && payload.dueAt !== oldDueAt?.toISOString() ? "SLA_DUE_DATE_OVERRIDDEN" : "SLA_UPDATED",
      resource: "Application",
      resourceId: applicationId,
      metadata: {
        oldPriority,
        newPriority: payload.priority,
        oldDueAt,
        newDueAt: payload.dueAt,
        reason: payload.reason,
      },
    });

    return updated;
  }

  /**
   * Force Recalculate SLA state
   */
  async recalculateSla(
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

    const evalResult = this.evaluateApplicationSla(app);

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { slaStatus: evalResult.currentStatus },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "SLA_RECALCULATED",
      resource: "Application",
      resourceId: applicationId,
      metadata: {
        previousStatus: app.slaStatus,
        newStatus: evalResult.currentStatus,
        remainingHours: evalResult.remainingHours,
        reason: reason || "Manual SLA recalculation triggered by administrator",
      },
    });

    return { application: updated, evalResult };
  }

  /**
   * Mark SLA Completed
   */
  async completeSla(
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

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.application.update({
        where: { id: applicationId },
        data: {
          slaStatus: SlaStatus.COMPLETED,
          completedAt: app.completedAt || now,
        },
      });

      await tx.applicationSlaEvent.create({
        data: {
          applicationId,
          eventType: SlaEventType.COMPLETED,
          category: SlaEventCategory.INTERNAL,
          startedAt: now,
          endedAt: now,
          reason: reason || "SLA marked completed by admin",
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      return res;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "SLA_MARKED_COMPLETED",
      resource: "Application",
      resourceId: applicationId,
      metadata: { reason },
    });

    return updated;
  }

  /**
   * Automated SLA Sweep across all active applications
   */
  async performSlaSweep(organizationId?: string, adminId?: string, adminEmail?: string) {
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
    let onTrackCount = 0;
    let atRiskCount = 0;
    let breachedCount = 0;
    let pausedCount = 0;

    for (const app of activeApps) {
      if (app.pausedAt) {
        pausedCount++;
        continue;
      }

      const evaluation = this.evaluateApplicationSla(app);

      if (evaluation.currentStatus === SlaStatus.ON_TRACK) onTrackCount++;
      if (evaluation.currentStatus === SlaStatus.AT_RISK) atRiskCount++;
      if (evaluation.currentStatus === SlaStatus.OVERDUE) breachedCount++;

      if (evaluation.currentStatus !== app.slaStatus) {
        await prisma.application.update({
          where: { id: app.id },
          data: { slaStatus: evaluation.currentStatus },
        });
        updatedCount++;

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

    if (organizationId && adminId && adminEmail) {
      await recordAuditLog({
        organizationId,
        actorId: adminId,
        actorEmail: adminEmail,
        actorRole: UserRole.ADMIN,
        action: "SLA_EVALUATION_SWEEP_RUN",
        resource: "SLA_SWEEP",
        metadata: {
          evaluatedCount: activeApps.length,
          updatedCount,
          onTrackCount,
          atRiskCount,
          breachedCount,
          pausedCount,
          alertsSent,
        },
      });
    }

    return {
      evaluatedCount: activeApps.length,
      updatedCount,
      onTrackCount,
      atRiskCount,
      breachedCount,
      pausedCount,
      alertsSent,
      errorsCount: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Operational SLA Performance Metrics (Harmonized authoritative query)
   */
  async getSlaMetrics(organizationId: string) {
    const activeBaseWhere = {
      organizationId,
      deletedAt: null,
      status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] },
    };

    const [totalApps, pausedCount, onTrackCount, atRiskCount, overdueCount, completedCount] = await Promise.all([
      prisma.application.count({ where: { organizationId, deletedAt: null } }),
      prisma.application.count({
        where: {
          ...activeBaseWhere,
          pausedAt: { not: null },
        },
      }),
      prisma.application.count({
        where: {
          ...activeBaseWhere,
          pausedAt: null,
          slaStatus: SlaStatus.ON_TRACK,
        },
      }),
      prisma.application.count({
        where: {
          ...activeBaseWhere,
          pausedAt: null,
          slaStatus: SlaStatus.AT_RISK,
        },
      }),
      prisma.application.count({
        where: {
          ...activeBaseWhere,
          pausedAt: null,
          slaStatus: SlaStatus.OVERDUE,
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

    const totalTracked = onTrackCount + atRiskCount + overdueCount + pausedCount;
    const activeTotal = totalTracked;
    const slaComplianceRate = activeTotal > 0 ? Math.round((onTrackCount / activeTotal) * 100) : 100;

    return {
      totalApplications: totalApps,
      totalTracked,
      totalActive: totalTracked,
      activeApplications: activeTotal,
      onTrack: onTrackCount,
      atRisk: atRiskCount,
      breached: overdueCount,
      overdue: overdueCount,
      paused: pausedCount,
      completed: completedCount,
      slaComplianceRate,
    };
  }
}

export const slaService = new SlaService();
