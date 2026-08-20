import { prisma } from "../../infrastructure/database/prisma.js";
import {
  ApplicationStatus,
  ApplicationPriority,
  SlaStatus,
  NoteVisibility,
  UserRole,
  Prisma,
  RequirementStatus,
  GovernmentStatus,
  ClientActionStatus,
} from "@prisma/client";
import {
  NotFoundError,
  ForbiddenError,
  InvalidStatusTransitionError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import {
  generateApplicationNumber,
  generateInvoiceNumber,
} from "../../common/utils/generators.js";
import { assertValidStatusTransition } from "../../common/utils/state-machine.js";
import { calculatePaymentBreakdown } from "../../common/utils/money.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { applicationReadinessService } from "./application-readiness.service.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";
import { PaginatedResult } from "../../common/types/index.js";

export class ApplicationService {
  async createApplication(
    params: {
      organizationId: string;
      clientId: string;
      serviceId: string;
      priority?: ApplicationPriority;
      assignedAdminId?: string | null;
      notesSummary?: string;
      metadata?: any;
    },
    actor: { id: string; email: string; role: UserRole; clientId?: string | null }
  ) {
    // 1. Verify Client and Service exist
    const [client, service] = await Promise.all([
      prisma.client.findFirst({
        where: { id: params.clientId, organizationId: params.organizationId, deletedAt: null },
        include: { user: true },
      }),
      prisma.service.findFirst({
        where: { id: params.serviceId, organizationId: params.organizationId, deletedAt: null },
        include: {
          requirements: {
            where: { active: true },
            orderBy: { displayOrder: "asc" },
          },
        },
      }),
    ]);

    if (!client) throw new NotFoundError("Client");
    if (!service) throw new NotFoundError("Service");

    // 2. SLA Due Date Calculation
    const startedAt = new Date();
    const dueAt = new Date(startedAt.getTime() + service.slaHours * 60 * 60 * 1000);

    // 3. Fee Calculations
    const feeBreakdown = calculatePaymentBreakdown({
      governmentFee: service.governmentFee,
      serviceFee: service.serviceFee,
      amountPaid: 0,
    });

    // 4. Atomic Creation Transaction
    const application = await prisma.$transaction(async (tx) => {
      const applicationNumber = await generateApplicationNumber(params.organizationId);
      const invoiceNumber = await generateInvoiceNumber(params.organizationId);

      // Create Application
      const app = await tx.application.create({
        data: {
          organizationId: params.organizationId,
          clientId: params.clientId,
          serviceId: params.serviceId,
          assignedAdminId: params.assignedAdminId || null,
          applicationNumber,
          status: ApplicationStatus.NEW,
          priority: params.priority || ApplicationPriority.NORMAL,
          slaStatus: SlaStatus.ON_TRACK,
          startedAt,
          dueAt,
          notesSummary: params.notesSummary || null,
          totalAmount: feeBreakdown.totalAmount,
          paidAmount: feeBreakdown.amountPaid,
          dueAmount: feeBreakdown.amountDue,
          currency: service.currency,
          metadata: params.metadata || Prisma.JsonNull,
        },
      });

      // Clone Requirement Snapshots
      if (service.requirements.length > 0) {
        await tx.applicationRequirement.createMany({
          data: service.requirements.map((req, index) => ({
            applicationId: app.id,
            serviceRequirementId: req.id,
            code: req.code,
            name: req.name,
            description: req.description,
            type: req.type,
            required: req.required,
            displayOrder: req.displayOrder || index + 1,
            isSatisfied: false,
            status: RequirementStatus.PENDING,
          })),
        });
      }

      // Create Initial Payment Record
      await tx.payment.create({
        data: {
          organizationId: params.organizationId,
          clientId: params.clientId,
          applicationId: app.id,
          invoiceNumber,
          currency: service.currency,
          governmentFee: feeBreakdown.governmentFee,
          serviceFee: feeBreakdown.serviceFee,
          otherFee: feeBreakdown.otherFee,
          discount: feeBreakdown.discount,
          tax: feeBreakdown.tax,
          totalAmount: feeBreakdown.totalAmount,
          amountPaid: feeBreakdown.amountPaid,
          amountDue: feeBreakdown.amountDue,
          dueAt,
        },
      });

      // Activity: Creation
      await tx.applicationActivity.create({
        data: {
          applicationId: app.id,
          actorId: actor.id,
          actorRole: actor.role,
          action: "APPLICATION_CREATED",
          entityType: "Application",
          entityId: app.id,
          toStatus: ApplicationStatus.NEW,
          message: `Application ${applicationNumber} created for ${service.name}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // Assignment record if assigned on creation
      if (params.assignedAdminId) {
        await tx.applicationAssignment.create({
          data: {
            applicationId: app.id,
            assignedAdminId: params.assignedAdminId,
            assignedById: actor.id,
            reason: "Initial assignment upon application creation",
          },
        });
      }

      // Audit Log
      await recordAuditLog(
        {
          organizationId: params.organizationId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "APPLICATION_CREATED",
          resource: "Application",
          resourceId: app.id,
          metadata: {
            applicationNumber,
            serviceCode: service.code,
            totalAmount: feeBreakdown.totalAmount.toString(),
          },
        },
        tx
      );

      return app;
    });

    // 5. Send multi-channel notifications
    if (client.user) {
      const ctx: BaseNotificationContext = {
        organizationId: params.organizationId,
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        serviceName: service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };
      void notificationOrchestrator.notifyApplicationCreated(ctx);
    }

    return this.getApplicationDetails(application.id, params.organizationId, actor);
  }

  async getApplicationDetails(
    applicationId: string,
    organizationId: string,
    actor: { id: string; role: UserRole; clientId?: string | null }
  ) {
    const isClient = actor.role === UserRole.CLIENT;

    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        organizationId,
        deletedAt: null,
        clientId: isClient ? actor.clientId || "none" : undefined,
      },
      include: {
        client: {
          select: {
            id: true,
            clientNumber: true,
            fullName: true,
            email: true,
            phone: true,
            clientType: true,
            nationalId: true,
            kraPin: true,
          },
        },
        service: {
          select: {
            id: true,
            code: true,
            slug: true,
            name: true,
            description: true,
            estimatedDuration: true,
            slaHours: true,
          },
        },
        assignedAdmin: isClient
          ? undefined
          : { select: { id: true, email: true } },
        requirements: {
          orderBy: { displayOrder: "asc" },
          include: {
            documents: {
              where: { deletedAt: null },
              include: {
                versions: {
                  orderBy: { versionNumber: "desc" },
                  take: 1,
                },
              },
            },
            reviewHistory: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        documents: {
          where: { deletedAt: null },
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1,
            },
          },
        },
        payments: {
          where: { deletedAt: null },
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        activities: {
          where: isClient
            ? { visibility: NoteVisibility.CLIENT_VISIBLE }
            : undefined,
          orderBy: { createdAt: "desc" },
        },
        notes: isClient
          ? { where: { visibility: NoteVisibility.CLIENT_VISIBLE, deletedAt: null }, orderBy: { createdAt: "desc" } }
          : { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { author: { select: { email: true } } } },
        assignments: isClient
          ? undefined
          : {
              orderBy: { createdAt: "desc" },
              include: {
                assignedAdmin: { select: { id: true, email: true } },
                assignedBy: { select: { id: true, email: true } },
              },
            },
        governmentApps: {
          orderBy: { createdAt: "desc" },
          include: {
            statusHistory: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        qualityChecks: {
          orderBy: { createdAt: "desc" },
        },
        deliveries: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("Application");
    }

    return application;
  }

  async listApplications(
    organizationId: string,
    params: {
      page: number;
      limit: number;
      status?: ApplicationStatus;
      priority?: ApplicationPriority;
      slaStatus?: SlaStatus;
      serviceId?: string;
      clientId?: string;
      assignedAdminId?: string;
      search?: string;
    },
    actor: { id: string; role: UserRole; clientId?: string | null }
  ): Promise<PaginatedResult<any>> {
    const isClient = actor.role === UserRole.CLIENT;
    const skip = (params.page - 1) * params.limit;

    const where: Prisma.ApplicationWhereInput = {
      organizationId,
      deletedAt: null,
      clientId: isClient ? actor.clientId || "none" : params.clientId || undefined,
      status: params.status || undefined,
      priority: params.priority || undefined,
      slaStatus: params.slaStatus || undefined,
      serviceId: params.serviceId || undefined,
      assignedAdminId: !isClient && params.assignedAdminId ? params.assignedAdminId : undefined,
    };

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { applicationNumber: { contains: q, mode: "insensitive" } },
        { client: { fullName: { contains: q, mode: "insensitive" } } },
        { client: { clientNumber: { contains: q, mode: "insensitive" } } },
        { client: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        skip,
        take: params.limit,
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
          service: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          assignedAdmin: isClient ? undefined : { select: { id: true, email: true } },
          governmentApps: {
            select: { id: true, platform: true, externalReference: true, status: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              requirements: true,
              documents: true,
              payments: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / params.limit) || 1;

    return {
      items,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    };
  }

  async transitionStatus(
    applicationId: string,
    organizationId: string,
    toStatus: ApplicationStatus,
    reason?: string,
    notifyClient: boolean = true,
    actor?: { id: string; email: string; role: UserRole }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    if (!app) throw new NotFoundError("Application");

    // 1. State machine transition validity check
    try {
      assertValidStatusTransition(app.status, toStatus);
    } catch {
      throw new InvalidStatusTransitionError(app.status, toStatus);
    }

    // 2. Readiness Engine gate validation (only if moving forward into rigorous stages)
    const validation = await applicationReadinessService.validateTransitionPrerequisites(
      applicationId,
      toStatus,
      organizationId
    );

    if (!validation.allowed) {
      throw new BadRequestError(validation.reason || "Application prerequisites not satisfied for this transition");
    }

    // 3. Compute SLA Pause / Resume timings
    const now = new Date();
    let newPausedAt: Date | null = app.pausedAt;
    let newTotalPausedDuration = app.totalPausedDuration;
    let newDueAt = app.dueAt;

    if (toStatus === ApplicationStatus.ON_HOLD && app.status !== ApplicationStatus.ON_HOLD) {
      newPausedAt = now;
    } else if (app.status === ApplicationStatus.ON_HOLD && toStatus !== ApplicationStatus.ON_HOLD) {
      if (app.pausedAt) {
        const pausedMinutes = Math.max(0, Math.floor((now.getTime() - app.pausedAt.getTime()) / (1000 * 60)));
        newTotalPausedDuration += pausedMinutes;
        if (app.dueAt) {
          newDueAt = new Date(app.dueAt.getTime() + pausedMinutes * 60 * 1000);
        }
      }
      newPausedAt = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const isCompleted = toStatus === ApplicationStatus.DELIVERED || toStatus === ApplicationStatus.CLOSED;
      const isSubmitted = toStatus === ApplicationStatus.SUBMITTED;
      const isDelivered = toStatus === ApplicationStatus.DELIVERED;

      const record = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: toStatus,
          completedAt: isCompleted ? now : undefined,
          submittedAt: isSubmitted ? now : undefined,
          deliveredAt: isDelivered ? now : undefined,
          slaStatus: isCompleted ? SlaStatus.COMPLETED : undefined,
          pausedAt: newPausedAt,
          totalPausedDuration: newTotalPausedDuration,
          dueAt: newDueAt,
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: actor?.id,
          actorRole: actor?.role,
          action: "STATUS_TRANSITION",
          entityType: "Application",
          entityId: applicationId,
          fromStatus: app.status,
          toStatus,
          message: reason || `Application transitioned from ${app.status} to ${toStatus}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      await recordAuditLog(
        {
          organizationId,
          actorId: actor?.id,
          actorEmail: actor?.email,
          actorRole: actor?.role,
          action: "STATUS_TRANSITION",
          resource: "Application",
          resourceId: applicationId,
          metadata: {
            from: app.status,
            to: toStatus,
            reason,
            pausedDurationMinutes: newTotalPausedDuration,
          },
        },
        tx
      );

      return record;
    });

    if (notifyClient && app.client.user) {
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
      void notificationOrchestrator.notifyStatusTransition(ctx, {
        fromStatus: app.status,
        toStatus,
        reason,
      });
    }

    return updated;
  }

  async addNote(
    applicationId: string,
    organizationId: string,
    content: string,
    visibility: NoteVisibility,
    authorId: string
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    return prisma.$transaction(async (tx) => {
      const note = await tx.applicationNote.create({
        data: {
          applicationId,
          authorId,
          visibility,
          content,
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: authorId,
          action: "NOTE_ADDED",
          entityType: "ApplicationNote",
          entityId: note.id,
          message: `Note added (${visibility})`,
          visibility,
        },
      });

      return note;
    });
  }

  async updatePriority(
    applicationId: string,
    organizationId: string,
    priority: ApplicationPriority,
    reason: string | undefined,
    actor: { id: string; email: string; role: UserRole }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.application.update({
        where: { id: applicationId },
        data: { priority },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: actor.id,
          actorRole: actor.role,
          action: "PRIORITY_CHANGED",
          entityType: "Application",
          entityId: applicationId,
          message: `Application priority updated from ${app.priority} to ${priority}${reason ? `: ${reason}` : ""}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      await recordAuditLog(
        {
          organizationId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "APPLICATION_PRIORITY_UPDATED",
          resource: "Application",
          resourceId: applicationId,
          metadata: { fromPriority: app.priority, toPriority: priority, reason },
        },
        tx
      );

      return result;
    });

    return updated;
  }

  async closeApplication(
    applicationId: string,
    organizationId: string,
    reason: string,
    completionNotes: string | undefined,
    actor: { id: string; email: string; role: UserRole }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    if (!app) throw new NotFoundError("Application");

    if (app.status === ApplicationStatus.CLOSED) {
      throw new BadRequestError("Application is already closed");
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const closed = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.CLOSED,
          completedAt: app.completedAt || now,
          slaStatus: SlaStatus.COMPLETED,
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: actor.id,
          actorRole: actor.role,
          action: "APPLICATION_CLOSED",
          entityType: "Application",
          entityId: applicationId,
          fromStatus: app.status,
          toStatus: ApplicationStatus.CLOSED,
          message: `Application formally closed: ${reason}${completionNotes ? ` (${completionNotes})` : ""}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      await recordAuditLog(
        {
          organizationId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "APPLICATION_CLOSED",
          resource: "Application",
          resourceId: applicationId,
          metadata: { previousStatus: app.status, reason, completionNotes },
        },
        tx
      );

      return closed;
    });

    return updated;
  }

  async getComprehensiveWorkQueue(
    organizationId: string,
    query: {
      status?: string;
      assignedAdminId?: string;
      serviceId?: string;
      priority?: string;
      slaStatus?: string;
      needsAttention?: boolean;
      overdue?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    // 1. Calculate live operational queue bucket counts
    const activeFilter = { organizationId, deletedAt: null };

    const [
      needsReviewCount,
      readyForSubmissionCount,
      inGovernmentProcessingCount,
      clientActionRequiredCount,
      readyForDeliveryCount,
      overdueCount,
      totalActiveCount,
    ] = await Promise.all([
      prisma.application.count({
        where: {
          ...activeFilter,
          status: { in: [ApplicationStatus.NEW, ApplicationStatus.DOCUMENT_REVIEW, ApplicationStatus.SUBMITTED] },
        },
      }),
      prisma.application.count({
        where: { ...activeFilter, status: ApplicationStatus.READY_FOR_SUBMISSION },
      }),
      prisma.application.count({
        where: { ...activeFilter, status: ApplicationStatus.GOVERNMENT_PROCESSING },
      }),
      prisma.application.count({
        where: {
          ...activeFilter,
          status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
        },
      }),
      prisma.application.count({
        where: {
          ...activeFilter,
          status: { in: [ApplicationStatus.DOCUMENT_RECEIVED, ApplicationStatus.QUALITY_CHECK, ApplicationStatus.READY_FOR_DELIVERY] },
        },
      }),
      prisma.application.count({
        where: {
          ...activeFilter,
          dueAt: { lte: now },
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.DELIVERED, ApplicationStatus.CANCELLED] },
        },
      }),
      prisma.application.count({
        where: {
          ...activeFilter,
          status: { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.DELIVERED, ApplicationStatus.CANCELLED] },
        },
      }),
    ]);

    // 2. Build where filter for list
    const where: any = { organizationId, deletedAt: null };

    if (query.status) {
      where.status = query.status as ApplicationStatus;
    }
    if (query.assignedAdminId) {
      where.assignedAdminId = query.assignedAdminId;
    }
    if (query.serviceId) {
      where.serviceId = query.serviceId;
    }
    if (query.priority) {
      where.priority = query.priority as ApplicationPriority;
    }
    if (query.slaStatus) {
      where.slaStatus = query.slaStatus as SlaStatus;
    }
    if (query.needsAttention) {
      where.status = ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED;
    }
    if (query.overdue) {
      where.dueAt = { lte: now };
      where.status = { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.DELIVERED, ApplicationStatus.CANCELLED] };
    }
    if (query.search) {
      where.OR = [
        { applicationNumber: { contains: query.search, mode: "insensitive" } },
        { client: { fullName: { contains: query.search, mode: "insensitive" } } },
        { client: { email: { contains: query.search, mode: "insensitive" } } },
        { client: { phone: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        include: {
          client: { select: { id: true, fullName: true, email: true, phone: true, clientType: true } },
          service: { select: { id: true, name: true, code: true, category: true, slaHours: true } },
          assignedAdmin: { select: { id: true, email: true } },
          clientActions: {
            where: { status: ClientActionStatus.OPEN },
            select: { id: true, title: true, type: true, dueAt: true, priority: true },
          },
          governmentApps: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, platform: true, governmentAgency: true, status: true, externalReference: true, nextFollowUpDate: true },
          },
        },
      }),
      prisma.application.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      buckets: {
        needsReview: needsReviewCount,
        readyForSubmission: readyForSubmissionCount,
        inGovernmentProcessing: inGovernmentProcessingCount,
        clientActionRequired: clientActionRequiredCount,
        readyForDelivery: readyForDeliveryCount,
        overdue: overdueCount,
        totalActive: totalActiveCount,
      },
    };
  }
}

export const applicationService = new ApplicationService();
