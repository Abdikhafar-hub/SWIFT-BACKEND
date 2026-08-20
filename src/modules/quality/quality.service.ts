import { prisma } from "../../infrastructure/database/prisma.js";
import { QCResult, UserRole, NoteVisibility, ApplicationStatus } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { applicationReadinessService } from "../applications/application-readiness.service.js";

export interface PerformQualityCheckInput {
  applicationId: string;
  organizationId: string;
  reviewerId: string;
  reviewerEmail: string;
  result: QCResult;
  checklist: Record<string, boolean>;
  notes?: string;
  failedReason?: string;
}

export class QualityCheckService {
  /**
   * Run automated pre-QC audit
   */
  async getQualityCheckStatus(applicationId: string, organizationId: string) {
    const readiness = await applicationReadinessService.evaluateReadiness(applicationId, organizationId);
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: {
        qualityChecks: {
          orderBy: { createdAt: "desc" },
          include: { reviewer: { select: { id: true, email: true } } },
        },
      },
    });

    if (!app) throw new NotFoundError("Application");

    // Standard QC checks
    const automatedChecks = {
      allRequirementsSatisfied: readiness.satisfiedRequiredRequirements >= readiness.requiredRequirements,
      allDocumentsApproved: readiness.rejectedDocuments === 0 && readiness.pendingDocuments === 0,
      paymentFullySettled: readiness.isPaymentComplete,
      governmentProcessed: Boolean(readiness.governmentProcessingStatus),
      hasZeroBlockers: readiness.ready,
    };

    const isEligibleForPassing =
      automatedChecks.allRequirementsSatisfied &&
      automatedChecks.allDocumentsApproved &&
      automatedChecks.paymentFullySettled;

    return {
      applicationId,
      applicationNumber: app.applicationNumber,
      automatedChecks,
      isEligibleForPassing,
      pastChecks: app.qualityChecks,
    };
  }

  /**
   * Admin executes formal QC decision
   */
  async performQualityCheck(input: PerformQualityCheckInput) {
    if (input.result !== QCResult.PASSED && !input.failedReason && !input.notes) {
      throw new BadRequestError("A reason or notes must be provided when a quality check does not pass.");
    }

    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId },
    });

    if (!app) throw new NotFoundError("Application");

    const qc = await prisma.$transaction(async (tx) => {
      const record = await tx.qualityCheck.create({
        data: {
          organizationId: input.organizationId,
          applicationId: input.applicationId,
          reviewerId: input.reviewerId,
          result: input.result,
          checklist: input.checklist,
          notes: input.notes || null,
          failedReason: input.failedReason || null,
        },
      });

      // Update application activity
      await tx.applicationActivity.create({
        data: {
          applicationId: input.applicationId,
          actorId: input.reviewerId,
          actorRole: UserRole.ADMIN,
          action: "QUALITY_CHECK_COMPLETED",
          entityType: "QualityCheck",
          entityId: record.id,
          message: `Quality Assurance checkpoint: ${input.result}${input.failedReason ? ` (${input.failedReason})` : ""}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });

      // If passed and currently in QUALITY_CHECK or DOCUMENT_RECEIVED, advance to READY_FOR_DELIVERY
      if (
        input.result === QCResult.PASSED &&
        (app.status === ApplicationStatus.QUALITY_CHECK ||
          app.status === ApplicationStatus.DOCUMENT_RECEIVED ||
          app.status === ApplicationStatus.APPROVED)
      ) {
        await tx.application.update({
          where: { id: app.id },
          data: { status: ApplicationStatus.READY_FOR_DELIVERY },
        });

        await tx.applicationActivity.create({
          data: {
            applicationId: input.applicationId,
            actorId: input.reviewerId,
            actorRole: UserRole.ADMIN,
            action: "STATUS_TRANSITION",
            entityType: "Application",
            entityId: app.id,
            fromStatus: app.status,
            toStatus: ApplicationStatus.READY_FOR_DELIVERY,
            message: "Quality Check passed. Application is ready for delivery.",
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      return record;
    });

    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.reviewerId,
      actorEmail: input.reviewerEmail,
      actorRole: UserRole.ADMIN,
      action: "QUALITY_CHECK_PERFORMED",
      resource: "QualityCheck",
      resourceId: qc.id,
      metadata: { result: input.result, failedReason: input.failedReason },
    });

    return qc;
  }
}

export const qualityCheckService = new QualityCheckService();
