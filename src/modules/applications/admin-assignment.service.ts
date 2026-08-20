import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, ApplicationStatus, SlaStatus, NoteVisibility } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";

export type QueueType =
  | "all"
  | "unassigned"
  | "assigned"
  | "overdue"
  | "due_soon"
  | "awaiting_client"
  | "awaiting_government"
  | "document_review"
  | "quality_check";

export class AdminAssignmentService {
  /**
   * Assign an application to an admin officer
   */
  async assignAdmin(params: {
    applicationId: string;
    organizationId: string;
    assignedAdminId: string;
    assignerId: string;
    assignerEmail: string;
    reason?: string;
  }) {
    const admin = await prisma.user.findFirst({
      where: {
        id: params.assignedAdminId,
        organizationId: params.organizationId,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    if (!admin) {
      throw new NotFoundError("Admin user to assign not found or inactive");
    }

    const application = await prisma.application.findFirst({
      where: { id: params.applicationId, organizationId: params.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application");
    }

    const previousAdminId = application.assignedAdminId;

    const result = await prisma.$transaction(async (tx) => {
      // Close any previous open assignment
      if (previousAdminId) {
        await tx.applicationAssignment.updateMany({
          where: {
            applicationId: params.applicationId,
            assignedAdminId: previousAdminId,
            unassignedAt: null,
          },
          data: { unassignedAt: new Date() },
        });
      }

      // Update application
      const updated = await tx.application.update({
        where: { id: params.applicationId },
        data: { assignedAdminId: params.assignedAdminId },
        include: {
          client: true,
          service: true,
          assignedAdmin: { select: { id: true, email: true } },
        },
      });

      // Create new assignment record
      await tx.applicationAssignment.create({
        data: {
          applicationId: params.applicationId,
          assignedAdminId: params.assignedAdminId,
          assignedById: params.assignerId,
          reason: params.reason,
        },
      });

      // Log activity
      await tx.applicationActivity.create({
        data: {
          applicationId: params.applicationId,
          actorId: params.assignerId,
          actorRole: UserRole.ADMIN,
          action: "ASSIGNMENT",
          entityType: "Application",
          entityId: params.applicationId,
          message: `Application assigned to admin ${admin.email}${params.reason ? ` (${params.reason})` : ""}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return updated;
    });

    await recordAuditLog({
      organizationId: params.organizationId,
      actorId: params.assignerId,
      actorEmail: params.assignerEmail,
      actorRole: UserRole.ADMIN,
      action: "APPLICATION_ASSIGNED",
      resource: "Application",
      resourceId: params.applicationId,
      metadata: {
        assignedAdminId: params.assignedAdminId,
        previousAdminId,
        reason: params.reason,
      },
    });

    return result;
  }

  /**
   * Unassign an application
   */
  async unassignAdmin(params: {
    applicationId: string;
    organizationId: string;
    unassignerId: string;
    unassignerEmail: string;
    reason?: string;
  }) {
    const application = await prisma.application.findFirst({
      where: { id: params.applicationId, organizationId: params.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application");
    }

    if (!application.assignedAdminId) {
      throw new BadRequestError("Application is not currently assigned to an admin.");
    }

    const previousAdminId = application.assignedAdminId;

    const result = await prisma.$transaction(async (tx) => {
      // Close open assignments
      await tx.applicationAssignment.updateMany({
        where: {
          applicationId: params.applicationId,
          assignedAdminId: previousAdminId,
          unassignedAt: null,
        },
        data: { unassignedAt: new Date() },
      });

      // Update application
      const updated = await tx.application.update({
        where: { id: params.applicationId },
        data: { assignedAdminId: null },
        include: { client: true, service: true },
      });

      // Log activity
      await tx.applicationActivity.create({
        data: {
          applicationId: params.applicationId,
          actorId: params.unassignerId,
          actorRole: UserRole.ADMIN,
          action: "UNASSIGNMENT",
          entityType: "Application",
          entityId: params.applicationId,
          message: `Application unassigned from admin${params.reason ? ` (${params.reason})` : ""}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      return updated;
    });

    await recordAuditLog({
      organizationId: params.organizationId,
      actorId: params.unassignerId,
      actorEmail: params.unassignerEmail,
      actorRole: UserRole.ADMIN,
      action: "APPLICATION_UNASSIGNED",
      resource: "Application",
      resourceId: params.applicationId,
      metadata: { previousAdminId, reason: params.reason },
    });

    return result;
  }

  /**
   * Workload Queue Query with operational filters
   */
  async getWorkloadQueue(params: {
    organizationId: string;
    queueType?: QueueType;
    assignedAdminId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: params.organizationId,
      deletedAt: null,
    };

    if (params.assignedAdminId) {
      where.assignedAdminId = params.assignedAdminId;
    }

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    switch (params.queueType) {
      case "unassigned":
        where.assignedAdminId = null;
        where.status = { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] };
        break;
      case "assigned":
        where.assignedAdminId = { not: null };
        break;
      case "overdue":
        where.slaStatus = SlaStatus.OVERDUE;
        where.status = { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] };
        break;
      case "due_soon":
        where.dueAt = { lte: in24Hours, gte: now };
        where.status = { notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED, ApplicationStatus.DELIVERED] };
        break;
      case "awaiting_client":
        where.status = {
          in: [ApplicationStatus.REQUIREMENTS_PENDING, ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED],
        };
        break;
      case "awaiting_government":
        where.status = {
          in: [ApplicationStatus.SUBMITTED, ApplicationStatus.GOVERNMENT_PROCESSING],
        };
        break;
      case "document_review":
        where.status = ApplicationStatus.DOCUMENT_REVIEW;
        break;
      case "quality_check":
        where.status = ApplicationStatus.QUALITY_CHECK;
        break;
      default:
        break;
    }

    if (params.search) {
      where.OR = [
        { applicationNumber: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
        { client: { clientNumber: { contains: params.search, mode: "insensitive" } } },
        { service: { name: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        include: {
          client: {
            select: { id: true, clientNumber: true, fullName: true, email: true, phone: true },
          },
          service: {
            select: { id: true, code: true, name: true, estimatedDuration: true, slaHours: true },
          },
          assignedAdmin: {
            select: { id: true, email: true },
          },
          governmentApps: {
            select: { id: true, platform: true, governmentAgency: true, externalReference: true, status: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const adminAssignmentService = new AdminAssignmentService();
