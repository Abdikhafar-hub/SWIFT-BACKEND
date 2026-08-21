import { prisma } from "../../infrastructure/database/prisma.js";
import {
  Prisma,
  QCResult,
  UserRole,
  NoteVisibility,
  ApplicationStatus,
  DocumentStatus,
  RequirementStatus,
  ClientActionType,
  ClientActionStatus,
  SlaEventCategory,
} from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { applicationReadinessService } from "../applications/application-readiness.service.js";
import { slaService } from "../sla/sla.service.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

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

export interface StartQcInspectionInput {
  organizationId: string;
  applicationId: string;
  reviewerId: string;
  reviewerEmail: string;
  assignedReviewerId?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  notes?: string;
}

export interface ReviewQcItemInput {
  organizationId: string;
  applicationId: string;
  requirementId: string;
  documentId?: string;
  reviewerId: string;
  reviewerEmail: string;
  action: "PASS" | "FAIL" | "REQUEST_REPLACEMENT" | "NOT_APPLICABLE";
  deficiencyCategory?: string;
  reviewerFeedback?: string;
  notes?: string;
}

export interface QcDecisionInput {
  organizationId: string;
  applicationId: string;
  reviewerId: string;
  reviewerEmail: string;
  decision: "CERTIFY_PASS" | "RETURN_TO_CLIENT" | "FAIL_FLAG" | "SAVE_PROGRESS";
  checklist?: Record<string, boolean>;
  notes?: string;
  failedReason?: string;
}

export class QualityCheckService {
  /**
   * Get dynamic QC Metrics for dashboard
   */
  async getQualityMetrics(organizationId: string) {
    const apps = await prisma.application.findMany({
      where: { organizationId, status: { not: ApplicationStatus.CANCELLED } },
      select: {
        id: true,
        status: true,
        qualityChecks: { select: { result: true } },
        clientActions: { select: { status: true, type: true } },
      },
    });

    const pendingCount = apps.filter((a) => a.status === ApplicationStatus.QUALITY_CHECK).length;
    const passedCount = apps.filter(
      (a) =>
        a.status === ApplicationStatus.READY_FOR_DELIVERY ||
        a.status === ApplicationStatus.READY_FOR_SUBMISSION ||
        a.status === ApplicationStatus.SUBMITTED ||
        a.status === ApplicationStatus.DELIVERED ||
        a.status === ApplicationStatus.CLOSED ||
        a.qualityChecks.some((qc) => qc.result === QCResult.PASSED)
    ).length;

    const returnedCount = apps.filter(
      (a) =>
        a.status === ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED ||
        a.status === ApplicationStatus.ON_HOLD ||
        a.clientActions.some(
          (ca) =>
            ca.status === ClientActionStatus.OPEN &&
            (ca.type === ClientActionType.REPLACE_DOCUMENT || ca.type === ClientActionType.UPLOAD_DOCUMENT)
        )
    ).length;

    return {
      pendingInspection: pendingCount,
      certifiedPasses: passedCount,
      returnedFlagged: returnedCount,
      totalMonitored: apps.length,
    };
  }

  /**
   * Get QC Queue with progress counts and filters
   */
  async getQualityQueue(organizationId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = { organizationId };

    // Search filter
    if (query.search && String(query.search).trim()) {
      const q = String(query.search).trim();
      where.OR = [
        { applicationNumber: { contains: q, mode: "insensitive" } },
        { client: { fullName: { contains: q, mode: "insensitive" } } },
        { client: { email: { contains: q, mode: "insensitive" } } },
        { service: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    // Status filter
    if (query.status && query.status !== "ALL") {
      switch (query.status) {
        case "PENDING":
        case "IN_PROGRESS":
          where.status = ApplicationStatus.QUALITY_CHECK;
          break;
        case "PASSED":
          where.status = {
            in: [
              ApplicationStatus.READY_FOR_DELIVERY,
              ApplicationStatus.READY_FOR_SUBMISSION,
              ApplicationStatus.SUBMITTED,
              ApplicationStatus.DELIVERED,
              ApplicationStatus.CLOSED,
            ],
          };
          break;
        case "RETURNED":
          where.status = ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED;
          break;
        case "FAILED":
        case "FLAGGED":
          where.status = ApplicationStatus.ON_HOLD;
          break;
      }
    }

    // Priority filter
    if (query.priority && query.priority !== "ALL") {
      where.priority = query.priority;
    }

    // Service filter
    if (query.serviceId) {
      where.serviceId = query.serviceId;
    }

    // Reviewer filter
    if (query.reviewerId) {
      where.qualityChecks = { some: { reviewerId: query.reviewerId } };
    }

    const total = await prisma.application.count({ where });
    const items = await prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        client: { select: { id: true, fullName: true, businessName: true, email: true, phone: true } },
        service: { select: { id: true, name: true, category: true } },
        requirements: { select: { id: true, required: true, status: true, isSatisfied: true } },
        documents: { select: { id: true, status: true, title: true } },
        qualityChecks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { reviewer: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    const formattedItems = items.map((app) => {
      const totalReqs = app.requirements.length;
      const satisfiedReqs = app.requirements.filter(
        (r) => r.status === RequirementStatus.APPROVED || r.isSatisfied
      ).length;
      const failedReqs = app.requirements.filter(
        (r) => r.status === RequirementStatus.CORRECTION_REQUIRED || r.status === RequirementStatus.REJECTED
      ).length;
      const pendingReqs = totalReqs - satisfiedReqs - failedReqs;

      const latestQc = app.qualityChecks[0] || null;

      return {
        ...app,
        progress: {
          totalRequirements: totalReqs,
          satisfied: satisfiedReqs,
          failed: failedReqs,
          pending: Math.max(0, pendingReqs),
        },
        assignedReviewer: latestQc?.reviewer || null,
      };
    });

    return {
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List applications eligible for QC inspection
   */
  async getEligibleApplications(organizationId: string, search?: string) {
    const where: Prisma.ApplicationWhereInput = {
      organizationId,
      status: { notIn: [ApplicationStatus.CANCELLED, ApplicationStatus.CLOSED, ApplicationStatus.DELIVERED] },
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { applicationNumber: { contains: q, mode: "insensitive" } },
        { client: { fullName: { contains: q, mode: "insensitive" } } },
        { client: { email: { contains: q, mode: "insensitive" } } },
        { service: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const apps = await prisma.application.findMany({
      where,
      take: 25,
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { id: true, fullName: true, businessName: true, email: true } },
        service: { select: { id: true, name: true } },
        requirements: { select: { id: true, required: true, isSatisfied: true, status: true } },
        qualityChecks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return apps.map((app) => {
      const missingRequired = app.requirements.filter(
        (r) => r.required && !r.isSatisfied && r.status !== RequirementStatus.APPROVED
      );
      const alreadyPassed = app.qualityChecks.length > 0 && app.qualityChecks[0].result === QCResult.PASSED;

      let eligible = true;
      let ineligibilityReason = "";

      if (app.status === ApplicationStatus.CANCELLED) {
        eligible = false;
        ineligibilityReason = "Application is cancelled";
      } else if (missingRequired.length > 0) {
        eligible = false;
        ineligibilityReason = `${missingRequired.length} required document(s) missing or unverified`;
      } else if (alreadyPassed) {
        eligible = true;
        ineligibilityReason = "Already passed QC (Re-inspection permitted)";
      }

      return {
        id: app.id,
        applicationNumber: app.applicationNumber,
        client: app.client,
        service: app.service,
        status: app.status,
        priority: app.priority,
        eligible,
        ineligibilityReason,
      };
    });
  }

  /**
   * Start a new QC Inspection workspace
   */
  async startInspection(input: StartQcInspectionInput) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId },
    });

    if (!app) throw new NotFoundError("Application");

    const reviewerId = input.assignedReviewerId || input.reviewerId;

    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: app.id },
        data: {
          status: ApplicationStatus.QUALITY_CHECK,
          ...(input.priority ? { priority: input.priority } : {}),
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId: app.id,
          actorId: input.reviewerId,
          actorRole: UserRole.ADMIN,
          action: "QC_INSPECTION_STARTED",
          entityType: "QualityCheck",
          entityId: app.id,
          message: `Quality Control Inspection initialized${input.notes ? `: ${input.notes}` : ""}`,
          visibility: NoteVisibility.INTERNAL,
        },
      });
    });

    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.reviewerId,
      actorEmail: input.reviewerEmail,
      actorRole: UserRole.ADMIN,
      action: "QC_INSPECTION_STARTED",
      resource: "Application",
      resourceId: app.id,
      metadata: { reviewerId, priority: input.priority || app.priority, notes: input.notes },
    });

    return { applicationId: app.id, status: ApplicationStatus.QUALITY_CHECK };
  }

  /**
   * Retrieve full QC workspace dossier
   */
  async getQcWorkspace(applicationId: string, organizationId: string) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: {
        client: { select: { id: true, fullName: true, businessName: true, email: true, phone: true, kraPin: true } },
        service: { select: { id: true, name: true, category: true, description: true } },
        requirements: {
          include: {
            documents: true,
          },
        },
        documents: true,
        qualityChecks: {
          orderBy: { createdAt: "desc" },
          include: { reviewer: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        clientActions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!app) throw new NotFoundError("Application Workspace");

    const readiness = await applicationReadinessService.evaluateReadiness(applicationId, organizationId);
    const slaTimeline = await slaService.getApplicationSlaTimeline(applicationId, organizationId).catch(() => null);

    return {
      application: app,
      readiness,
      slaTimeline,
    };
  }

  /**
   * Review individual requirement / document item in QC workspace
   */
  async reviewItem(input: ReviewQcItemInput) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId },
      include: {
        client: { include: { user: true } },
        service: { select: { name: true } },
      },
    });

    if (!app) throw new NotFoundError("Application");

    const req = await prisma.applicationRequirement.findFirst({
      where: { id: input.requirementId, applicationId: input.applicationId },
    });

    if (!req) throw new NotFoundError("Application Requirement");

    const document = input.documentId
      ? await prisma.document.findFirst({ where: { id: input.documentId } })
      : null;

    if (input.action === "PASS") {
      await prisma.$transaction(async (tx) => {
        await tx.applicationRequirement.update({
          where: { id: req.id },
          data: {
            status: RequirementStatus.APPROVED,
            isSatisfied: true,
            rejectionReason: null,
          },
        });

        if (document) {
          await tx.document.update({
            where: { id: document.id },
            data: { status: DocumentStatus.APPROVED },
          });
        }
      });

      await recordAuditLog({
        organizationId: input.organizationId,
        actorId: input.reviewerId,
        actorEmail: input.reviewerEmail,
        actorRole: UserRole.ADMIN,
        action: "QC_DOCUMENT_PASSED",
        resource: "ApplicationRequirement",
        resourceId: req.id,
        metadata: { requirementName: req.name, documentId: document?.id },
      });
    } else if (input.action === "FAIL" || input.action === "REQUEST_REPLACEMENT") {
      const reason = input.reviewerFeedback || input.deficiencyCategory || "Quality Control deficiency identified";

      await prisma.$transaction(async (tx) => {
        await tx.applicationRequirement.update({
          where: { id: req.id },
          data: {
            status: RequirementStatus.CORRECTION_REQUIRED,
            isSatisfied: false,
            rejectionReason: reason,
          },
        });

        if (document) {
          await tx.document.update({
            where: { id: document.id },
            data: { status: DocumentStatus.REJECTED },
          });
        }

        // Create ClientAction if replacement requested
        if (input.action === "REQUEST_REPLACEMENT" && app.client) {
          await tx.clientAction.create({
            data: {
              organizationId: input.organizationId,
              applicationId: app.id,
              requirementId: req.id,
              type: ClientActionType.REPLACE_DOCUMENT,
              status: ClientActionStatus.OPEN,
              title: `Replacement Document Required: ${req.name}`,
              description: `Deficiency (${input.deficiencyCategory || "Correction Required"}): ${reason}`,
              createdById: input.reviewerId,
            },
          });

          // Transition application status to ADDITIONAL_INFORMATION_REQUIRED
          await tx.application.update({
            where: { id: app.id },
            data: { status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED },
          });
        }
      });

      // Pause SLA clock if waiting for client document replacement
      if (input.action === "REQUEST_REPLACEMENT") {
        await slaService.pauseSla(
          app.id,
          input.organizationId,
          input.reviewerId,
          input.reviewerEmail,
          SlaEventCategory.CLIENT_WAITING,
          `Awaiting replacement document for ${req.name}: ${reason}`
        ).catch(() => null);

        // Send Notification to client
        if (app.client?.user) {
          await notificationOrchestrator.notifyRequirementReview(
            {
              organizationId: input.organizationId,
              applicationId: app.id,
              applicationNumber: app.applicationNumber,
              serviceName: app.service.name,
              clientUserId: app.client.user.id,
              clientName: app.client.fullName,
              clientEmail: app.client.email,
              clientPhone: app.client.phone,
            },
            {
              reqName: req.name,
              status: "CORRECTION_REQUIRED",
              reason,
            }
          ).catch(() => null);
        }
      }

      await recordAuditLog({
        organizationId: input.organizationId,
        actorId: input.reviewerId,
        actorEmail: input.reviewerEmail,
        actorRole: UserRole.ADMIN,
        action: input.action === "REQUEST_REPLACEMENT" ? "QC_CLIENT_ACTION_CREATED" : "QC_DOCUMENT_FAILED",
        resource: "ApplicationRequirement",
        resourceId: req.id,
        metadata: {
          requirementName: req.name,
          deficiencyCategory: input.deficiencyCategory,
          feedback: input.reviewerFeedback,
        },
      });
    }

    return { requirementId: req.id, action: input.action };
  }

  /**
   * Formal QC Decision (Certify Pass, Return to Client, Fail / Flag, Save Progress)
   */
  async submitDecision(input: QcDecisionInput) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId },
    });

    if (!app) throw new NotFoundError("Application");

    if (input.decision === "CERTIFY_PASS") {
      const readiness = await applicationReadinessService.evaluateReadiness(input.applicationId, input.organizationId);

      if (!readiness.ready) {
        const missingCount = readiness.requiredRequirements - readiness.satisfiedRequiredRequirements;
        throw new BadRequestError(
          `QC Certification cannot be completed because ${missingCount > 0 ? `${missingCount} mandatory requirement(s) remain unresolved` : "dossier conditions are incomplete"}.`
        );
      }

      const qc = await prisma.$transaction(async (tx) => {
        const record = await tx.qualityCheck.create({
          data: {
            organizationId: input.organizationId,
            applicationId: input.applicationId,
            reviewerId: input.reviewerId,
            result: QCResult.PASSED,
            checklist: input.checklist || {},
            notes: input.notes || "Statutory Quality Control certified PASSED",
          },
        });

        await tx.application.update({
          where: { id: app.id },
          data: { status: ApplicationStatus.READY_FOR_DELIVERY },
        });

        await tx.applicationActivity.create({
          data: {
            applicationId: app.id,
            actorId: input.reviewerId,
            actorRole: UserRole.ADMIN,
            action: "QC_CERTIFIED_PASSED",
            entityType: "QualityCheck",
            entityId: record.id,
            message: "Formal Quality Control Inspection PASSED and Certified. Application is ready for delivery.",
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });

        return record;
      });

      await recordAuditLog({
        organizationId: input.organizationId,
        actorId: input.reviewerId,
        actorEmail: input.reviewerEmail,
        actorRole: UserRole.ADMIN,
        action: "QC_CERTIFIED_PASSED",
        resource: "QualityCheck",
        resourceId: qc.id,
        metadata: { decision: input.decision },
      });

      return { status: ApplicationStatus.READY_FOR_DELIVERY, result: QCResult.PASSED };
    }

    if (input.decision === "RETURN_TO_CLIENT") {
      if (!input.failedReason && !input.notes) {
        throw new BadRequestError("Return reason or audit justification must be provided when returning to client.");
      }

      const qc = await prisma.$transaction(async (tx) => {
        const record = await tx.qualityCheck.create({
          data: {
            organizationId: input.organizationId,
            applicationId: input.applicationId,
            reviewerId: input.reviewerId,
            result: QCResult.FAILED,
            checklist: input.checklist || {},
            notes: input.notes || null,
            failedReason: input.failedReason || "Returned to client for deficiency resolution",
          },
        });

        await tx.application.update({
          where: { id: app.id },
          data: { status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED },
        });

        await tx.applicationActivity.create({
          data: {
            applicationId: app.id,
            actorId: input.reviewerId,
            actorRole: UserRole.ADMIN,
            action: "QC_INSPECTION_RETURNED",
            entityType: "QualityCheck",
            entityId: record.id,
            message: `QC Inspection returned to client: ${input.failedReason || input.notes}`,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });

        return record;
      });

      await slaService.pauseSla(
        app.id,
        input.organizationId,
        input.reviewerId,
        input.reviewerEmail,
        SlaEventCategory.CLIENT_WAITING,
        `QC returned: ${input.failedReason || input.notes}`
      ).catch(() => null);

      await recordAuditLog({
        organizationId: input.organizationId,
        actorId: input.reviewerId,
        actorEmail: input.reviewerEmail,
        actorRole: UserRole.ADMIN,
        action: "QC_INSPECTION_RETURNED",
        resource: "QualityCheck",
        resourceId: qc.id,
        metadata: { decision: input.decision, failedReason: input.failedReason },
      });

      return { status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED, result: QCResult.FAILED };
    }

    if (input.decision === "FAIL_FLAG") {
      await prisma.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.ON_HOLD },
      });

      await recordAuditLog({
        organizationId: input.organizationId,
        actorId: input.reviewerId,
        actorEmail: input.reviewerEmail,
        actorRole: UserRole.ADMIN,
        action: "QC_APPLICATION_FLAGGED",
        resource: "Application",
        resourceId: app.id,
        metadata: { decision: input.decision, failedReason: input.failedReason },
      });

      return { status: ApplicationStatus.ON_HOLD, result: QCResult.FAILED };
    }

    // SAVE_PROGRESS
    return { status: app.status, message: "QC progress saved successfully" };
  }

  /**
   * Run automated pre-QC audit (Existing backward compatible helper)
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
   * Admin executes formal QC decision (Existing backward compatible helper)
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
