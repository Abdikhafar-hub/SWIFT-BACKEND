import { prisma } from "../../infrastructure/database/prisma.js";
import {
  ClientActionType,
  ClientActionStatus,
  ApplicationPriority,
  ApplicationStatus,
  UserRole,
  NoteVisibility,
  SlaEventType,
  SlaEventCategory,
  NotificationChannel,
  NotificationStatus,
} from "@prisma/client";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export interface CreateClientActionInput {
  type: ClientActionType;
  title: string;
  description: string;
  priority?: ApplicationPriority;
  dueAt?: Date;
  requirementId?: string;
}

export interface CompleteClientActionInput {
  completionNotes?: string;
  responsePayload?: any;
  documentId?: string;
}

export class ClientActionsService {
  /**
   * Create an action item for client
   */
  async createAction(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: CreateClientActionInput
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    if (!app) throw new NotFoundError("Application");

    const now = new Date();
    const shouldPauseSla = app.service.pauseSlaOnClientAction !== false;

    const action = await prisma.$transaction(async (tx) => {
      const clientAction = await tx.clientAction.create({
        data: {
          organizationId,
          applicationId,
          requirementId: data.requirementId || null,
          type: data.type,
          title: data.title,
          description: data.description,
          priority: data.priority || ApplicationPriority.NORMAL,
          dueAt: data.dueAt || null,
          status: ClientActionStatus.OPEN,
          createdById: adminId,
        },
      });

      // Update application status to ADDITIONAL_INFORMATION_REQUIRED if currently in an active state
      if (
        app.status !== ApplicationStatus.CANCELLED &&
        app.status !== ApplicationStatus.CLOSED &&
        app.status !== ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED
      ) {
        await tx.application.update({
          where: { id: applicationId },
          data: {
            status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
            pausedAt: shouldPauseSla ? now : app.pausedAt,
          },
        });
      }

      // Log ApplicationActivity
      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "CLIENT_ACTION_REQUESTED",
          entityType: "ClientAction",
          entityId: clientAction.id,
          toStatus: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
          message: `Action requested from client: "${data.title}" (${data.type})`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // Emit SLA Pause Event
      if (shouldPauseSla) {
        await tx.applicationSlaEvent.create({
          data: {
            applicationId,
            eventType: SlaEventType.PAUSED,
            category: SlaEventCategory.CLIENT_WAITING,
            reason: `Paused for client action: ${data.title}`,
            actorId: adminId,
            actorRole: UserRole.ADMIN,
          },
        });
      }

      return clientAction;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "CLIENT_ACTION_CREATED",
      resource: "ClientAction",
      resourceId: action.id,
      metadata: {
        type: data.type,
        title: data.title,
        priority: data.priority,
        dueAt: data.dueAt,
      },
    });

    // Notify client
    if (app.client.user) {
      const ctx: BaseNotificationContext = {
        organizationId,
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        serviceName: app.service.name,
        clientUserId: app.client.user.id,
        clientName: app.client.fullName,
        clientEmail: app.client.email,
        clientPhone: app.client.phone,
      };
      void notificationOrchestrator.notifyClientActionRequired(ctx, {
        actionTitle: data.title,
        actionDescription: data.description,
        deadline: data.dueAt,
      });
    }

    return action;
  }

  /**
   * Complete client action (by client or on behalf by admin)
   */
  async completeAction(
    actionId: string,
    organizationId: string,
    actorId: string,
    actorRole: UserRole,
    actorEmail: string,
    data: CompleteClientActionInput
  ) {
    const action = await prisma.clientAction.findFirst({
      where: { id: actionId, organizationId },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!action) throw new NotFoundError("Client action");

    // If client, ensure they own the application
    if (actorRole === UserRole.CLIENT) {
      if (action.application.client.userId !== actorId) {
        throw new ForbiddenError("You cannot complete an action on an application you do not own");
      }
    }

    if (action.status === ClientActionStatus.COMPLETED) {
      throw new BadRequestError("This action is already completed");
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark action completed
      const updatedAction = await tx.clientAction.update({
        where: { id: actionId },
        data: {
          status: ClientActionStatus.COMPLETED,
          completedAt: now,
          completedById: actorId,
          completionNotes: data.completionNotes || null,
          responsePayload: data.responsePayload || undefined,
        },
      });

      // 2. Check remaining open actions
      const remainingOpenCount = await tx.clientAction.count({
        where: {
          applicationId: action.applicationId,
          status: ClientActionStatus.OPEN,
          id: { not: actionId },
        },
      });

      // 3. If no more open actions, resume application
      let applicationResumed = false;
      let newStatus = action.application.status;

      if (remainingOpenCount === 0) {
        applicationResumed = true;
        if (action.application.status === ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED) {
          const hasGovApp = await tx.governmentApplication.findFirst({
            where: { applicationId: action.applicationId },
          });
          newStatus = hasGovApp ? ApplicationStatus.GOVERNMENT_PROCESSING : ApplicationStatus.DOCUMENT_REVIEW;
        }

        await tx.application.update({
          where: { id: action.applicationId },
          data: {
            status: newStatus,
            pausedAt: null,
          },
        });

        // Emit SLA Resumed Event
        await tx.applicationSlaEvent.create({
          data: {
            applicationId: action.applicationId,
            eventType: SlaEventType.RESUMED,
            category: SlaEventCategory.INTERNAL,
            reason: `All client actions resolved. Application processing resumed.`,
            actorId,
            actorRole,
          },
        });
      }

      // 4. Log Application Activity
      await tx.applicationActivity.create({
        data: {
          applicationId: action.applicationId,
          actorId,
          actorRole,
          action: "CLIENT_ACTION_COMPLETED",
          entityType: "ClientAction",
          entityId: action.id,
          toStatus: applicationResumed ? newStatus : action.application.status,
          message: `Client action completed: "${action.title}" (${actorRole === UserRole.CLIENT ? "by Client" : "by Admin"})`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      return { updatedAction, remainingOpenCount, applicationResumed };
    });

    await recordAuditLog({
      organizationId,
      actorId,
      actorEmail,
      actorRole,
      action: "CLIENT_ACTION_COMPLETED",
      resource: "ClientAction",
      resourceId: actionId,
      metadata: {
        actionTitle: action.title,
        completedByRole: actorRole,
        remainingOpenCount: result.remainingOpenCount,
      },
    });

    if (actorRole === UserRole.CLIENT && action.application.assignedAdminId) {
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId: action.application.assignedAdminId,
            applicationId: action.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "CLIENT_ACTION_RESOLVED",
            title: `Client Action Resolved: ${action.title}`,
            message: `Client has resolved directive "${action.title}" on application #${action.application.applicationNumber}.`,
            status: NotificationStatus.DELIVERED,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to send admin action completion notification:", err);
      }
    }



    return result;
  }

  /**
   * Cancel action
   */
  async cancelAction(
    actionId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    reason: string
  ) {
    const action = await prisma.clientAction.findFirst({
      where: { id: actionId, organizationId },
      include: { application: true },
    });

    if (!action) throw new NotFoundError("Client action");

    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.clientAction.update({
        where: { id: actionId },
        data: {
          status: ClientActionStatus.CANCELLED,
          completionNotes: `Cancelled by admin: ${reason}`,
        },
      });

      const remainingOpenCount = await tx.clientAction.count({
        where: {
          applicationId: action.applicationId,
          status: ClientActionStatus.OPEN,
        },
      });

      if (remainingOpenCount === 0 && action.application.pausedAt) {
        const hasGovApp = await tx.governmentApplication.findFirst({
          where: { applicationId: action.applicationId },
        });
        const newStatus =
          action.application.status === ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED
            ? hasGovApp ? ApplicationStatus.GOVERNMENT_PROCESSING : ApplicationStatus.DOCUMENT_REVIEW
            : action.application.status;

        await tx.application.update({
          where: { id: action.applicationId },
          data: {
            pausedAt: null,
            status: newStatus,
          },
        });

        await tx.applicationSlaEvent.create({
          data: {
            applicationId: action.applicationId,
            eventType: SlaEventType.RESUMED,
            category: SlaEventCategory.INTERNAL,
            reason: `Action cancelled. Application processing resumed.`,
            actorId: adminId,
            actorRole: UserRole.ADMIN,
          },
        });
      }

      return cancelled;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "CLIENT_ACTION_CANCELLED",
      resource: "ClientAction",
      resourceId: actionId,
      metadata: { reason },
    });

    return updated;
  }

  /**
   * Get single action by ID with strict security checks
   */
  async getActionById(
    actionId: string,
    organizationId: string,
    userRole: UserRole,
    clientId?: string
  ) {
    const action = await prisma.clientAction.findFirst({
      where: { id: actionId, organizationId },
      include: {
        application: {
          select: {
            id: true,
            applicationNumber: true,
            clientId: true,
            status: true,
            priority: true,
            service: { select: { id: true, name: true } },
            client: { select: { id: true, fullName: true, businessName: true, email: true, phone: true } },
          },
        },
        requirement: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, email: true } },
        completedBy: { select: { id: true, email: true } },
      },
    });

    if (!action) throw new NotFoundError("Client action");

    if (userRole === UserRole.CLIENT) {
      if (!clientId || action.application.clientId !== clientId) {
        throw new ForbiddenError("Access denied to this action item");
      }
    }

    return action;
  }

  /**
   * Get paginated actions for Admin Action Center
   */
  async getAllActionsForAdmin(
    organizationId: string,
    query: {
      status?: ClientActionStatus;
      priority?: ApplicationPriority;
      type?: ClientActionType;
      applicationId?: string;
      clientId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.type) where.type = query.type;
    if (query.applicationId) where.applicationId = query.applicationId;

    if (query.clientId) {
      where.application = { clientId: query.clientId };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { application: { applicationNumber: { contains: query.search, mode: "insensitive" } } },
        { application: { client: { fullName: { contains: query.search, mode: "insensitive" } } } },
        { application: { client: { businessName: { contains: query.search, mode: "insensitive" } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.clientAction.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        include: {
          application: {
            select: {
              id: true,
              applicationNumber: true,
              status: true,
              priority: true,
              service: { select: { id: true, name: true } },
              client: { select: { id: true, fullName: true, businessName: true, email: true } },
            },
          },
          requirement: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, email: true } },
          completedBy: { select: { id: true, email: true } },
        },
      }),
      prisma.clientAction.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get actions for a specific application
   */
  async getApplicationActions(
    applicationId: string,
    organizationId: string,
    userRole: UserRole,
    clientId?: string
  ) {
    const appWhere: any = { id: applicationId, organizationId, deletedAt: null };
    if (userRole === UserRole.CLIENT && clientId) {
      appWhere.clientId = clientId;
    }

    const app = await prisma.application.findFirst({ where: appWhere });
    if (!app) throw new NotFoundError("Application");

    return prisma.clientAction.findMany({
      where: { applicationId, organizationId },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        requirement: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, email: true } },
        completedBy: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Get actions for client portal (open or all)
   */
  async getClientActions(organizationId: string, clientId: string, status?: ClientActionStatus) {
    const where: any = {
      organizationId,
      application: {
        clientId,
        deletedAt: null,
      },
    };

    if (status) where.status = status;

    return prisma.clientAction.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        application: {
          select: {
            id: true,
            applicationNumber: true,
            service: { select: { id: true, name: true } },
          },
        },
        requirement: { select: { id: true, name: true, type: true } },
      },
    });
  }

  /**
   * Get open actions for client dashboard
   */
  async getClientOpenActions(organizationId: string, clientId: string) {
    return this.getClientActions(organizationId, clientId, ClientActionStatus.OPEN);
  }
}

export const clientActionsService = new ClientActionsService();

