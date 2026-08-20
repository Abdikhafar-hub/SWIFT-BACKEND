import { prisma } from "../../infrastructure/database/prisma.js";
import { RequirementStatus, UserRole } from "@prisma/client";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export interface SubmitRequirementValueInput {
  applicationId: string;
  requirementId: string;
  organizationId: string;
  clientId?: string;
  userId: string;
  userRole: UserRole;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date;
  valueBoolean?: boolean;
  valueJson?: any;
  reason?: string;
}

export interface ReviewRequirementInput {
  applicationId: string;
  requirementId: string;
  organizationId: string;
  adminId: string;
  adminEmail: string;
  action: "APPROVE" | "REJECT" | "REQUEST_CORRECTION";
  reason?: string;
  reviewNotes?: string;
}

export class RequirementReviewService {
  /**
   * Submit or update a dynamic requirement answer (Client or Admin)
   */
  async submitRequirementValue(input: SubmitRequirementValueInput) {
    const req = await prisma.applicationRequirement.findFirst({
      where: { id: input.requirementId, applicationId: input.applicationId },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!req) {
      throw new NotFoundError("Application requirement not found");
    }

    if (input.userRole === UserRole.CLIENT && input.clientId && req.application.clientId !== input.clientId) {
      throw new ForbiddenError("You cannot submit requirements for another client's application");
    }

    const previousValue = {
      valueText: req.valueText,
      valueNumber: req.valueNumber,
      valueDate: req.valueDate,
      valueBoolean: req.valueBoolean,
      valueJson: req.valueJson,
    };

    const isUpdate = req.isSatisfied || req.status !== RequirementStatus.PENDING;
    const historyAction = isUpdate ? "UPDATE" : "SUBMIT";

    const updated = await prisma.$transaction(async (tx) => {
      const updatedReq = await tx.applicationRequirement.update({
        where: { id: req.id },
        data: {
          isSatisfied: true,
          status: RequirementStatus.SUBMITTED,
          submittedAt: new Date(),
          valueText: input.valueText,
          valueNumber: input.valueNumber,
          valueDate: input.valueDate,
          valueBoolean: input.valueBoolean,
          valueJson: input.valueJson,
          satisfiedAt: new Date(),
          satisfiedById: input.userId,
        },
      });

      // Record in RequirementReviewHistory
      await tx.requirementReviewHistory.create({
        data: {
          applicationRequirementId: req.id,
          actorId: input.userId,
          actorRole: input.userRole,
          action: historyAction,
          previousValue,
          newValue: {
            valueText: input.valueText,
            valueNumber: input.valueNumber,
            valueDate: input.valueDate,
            valueBoolean: input.valueBoolean,
            valueJson: input.valueJson,
          },
          status: RequirementStatus.SUBMITTED,
          reason: input.reason,
        },
      });

      // Record ApplicationActivity
      await tx.applicationActivity.create({
        data: {
          applicationId: req.applicationId,
          actorId: input.userId,
          actorRole: input.userRole,
          action: "REQUIREMENT_SUBMITTED",
          entityType: "ApplicationRequirement",
          entityId: req.id,
          message: `${input.userRole === UserRole.ADMIN ? "Admin" : "Client"} submitted value for requirement "${req.name}".`,
        },
      });

      return updatedReq;
    });

    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      actorRole: input.userRole,
      action: "REQUIREMENT_SUBMITTED",
      resource: "ApplicationRequirement",
      resourceId: req.id,
      metadata: { requirementCode: req.code, isUpdate },
    });

    return updated;
  }

  /**
   * Admin reviews a requirement (APPROVE, REJECT, REQUEST_CORRECTION)
   */
  async reviewRequirement(input: ReviewRequirementInput) {
    if ((input.action === "REJECT" || input.action === "REQUEST_CORRECTION") && !input.reason) {
      throw new BadRequestError(`A reason is mandatory when ${input.action.toLowerCase().replace("_", " ")}ing a requirement.`);
    }

    const req = await prisma.applicationRequirement.findFirst({
      where: { id: input.requirementId, applicationId: input.applicationId },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!req) {
      throw new NotFoundError("Application requirement not found");
    }

    let targetStatus: RequirementStatus;
    let isSatisfied: boolean;

    if (input.action === "APPROVE") {
      targetStatus = RequirementStatus.APPROVED;
      isSatisfied = true;
    } else if (input.action === "REJECT") {
      targetStatus = RequirementStatus.REJECTED;
      isSatisfied = false;
    } else {
      targetStatus = RequirementStatus.CORRECTION_REQUIRED;
      isSatisfied = false;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedReq = await tx.applicationRequirement.update({
        where: { id: req.id },
        data: {
          status: targetStatus,
          isSatisfied,
          rejectionReason: input.reason || null,
          reviewNotes: input.reviewNotes || null,
          reviewedAt: new Date(),
          reviewedById: input.adminId,
          verifiedAt: input.action === "APPROVE" ? new Date() : null,
          verifiedById: input.action === "APPROVE" ? input.adminId : null,
        },
      });

      // Append to review history
      await tx.requirementReviewHistory.create({
        data: {
          applicationRequirementId: req.id,
          actorId: input.adminId,
          actorRole: UserRole.ADMIN,
          action: input.action,
          status: targetStatus,
          reason: input.reason,
          notes: input.reviewNotes,
        },
      });

      // Record Activity
      await tx.applicationActivity.create({
        data: {
          applicationId: req.applicationId,
          actorId: input.adminId,
          actorRole: UserRole.ADMIN,
          action: `REQUIREMENT_${input.action}`,
          entityType: "ApplicationRequirement",
          entityId: req.id,
          message: `Admin ${input.action.toLowerCase().replace("_", " ")}d requirement "${req.name}". ${input.reason ? `Reason: ${input.reason}` : ""}`,
        },
      });

      return updatedReq;
    });

    // Notify Client
    const client = req.application.client;
    const clientUser = client.user;
    if (clientUser) {
      const ctx: BaseNotificationContext = {
        organizationId: input.organizationId,
        applicationId: req.applicationId,
        applicationNumber: req.application.applicationNumber,
        serviceName: req.application.service.name,
        clientUserId: clientUser.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };

      await notificationOrchestrator.notifyRequirementReview(ctx, {
        reqName: req.name,
        status: targetStatus,
        reason: input.reason,
        notes: input.reviewNotes,
      });
    }

    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.adminId,
      actorEmail: input.adminEmail,
      actorRole: UserRole.ADMIN,
      action: `REQUIREMENT_${input.action}`,
      resource: "ApplicationRequirement",
      resourceId: req.id,
      metadata: { targetStatus, reason: input.reason },
    });

    return updated;
  }

  /**
   * Fetch complete history of a requirement
   */
  async getRequirementHistory(requirementId: string, applicationId: string) {
    return prisma.requirementReviewHistory.findMany({
      where: {
        applicationRequirementId: requirementId,
        requirement: { applicationId },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const requirementReviewService = new RequirementReviewService();
