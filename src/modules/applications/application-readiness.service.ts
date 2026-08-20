import { prisma } from "../../infrastructure/database/prisma.js";
import { ApplicationStatus, DocumentStatus, RequirementStatus, QCResult, GovernmentStatus } from "@prisma/client";
import { NotFoundError } from "../../common/errors/app-error.js";

export interface ApplicationReadinessReport {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  completedRequirements: number;
  totalRequirements: number;
  requiredRequirements: number;
  satisfiedRequiredRequirements: number;
  rejectedDocuments: number;
  pendingDocuments: number;
  approvedDocuments: number;
  outstandingAmount: string;
  paidAmount: string;
  totalAmount: string;
  isPaymentComplete: boolean;
  qualityCheckPassed: boolean;
  governmentProcessingStatus: string | null;
}

export class ApplicationReadinessService {
  /**
   * Evaluate the overall readiness of an application
   */
  async evaluateReadiness(applicationId: string, organizationId?: string): Promise<ApplicationReadinessReport> {
    const where: any = { id: applicationId };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const app = await prisma.application.findFirst({
      where,
      include: {
        service: true,
        requirements: {
          include: {
            documents: {
              include: {
                versions: {
                  orderBy: { versionNumber: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
        documents: true,
        payments: true,
        governmentApps: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        qualityChecks: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!app) {
      throw new NotFoundError("Application not found for readiness evaluation");
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Requirements evaluation
    const totalRequirements = app.requirements.length;
    const requiredReqs = app.requirements.filter((r) => r.required);
    const requiredCount = requiredReqs.length;
    let satisfiedRequiredCount = 0;
    let completedCount = 0;

    let rejectedDocsCount = 0;
    let pendingDocsCount = 0;
    let approvedDocsCount = 0;

    for (const req of app.requirements) {
      const isReqSatisfied =
        req.isSatisfied &&
        req.status !== RequirementStatus.REJECTED &&
        req.status !== RequirementStatus.CORRECTION_REQUIRED;
      if (isReqSatisfied) {
        completedCount++;
        if (req.required) satisfiedRequiredCount++;
      } else if (req.status === RequirementStatus.REJECTED || req.status === RequirementStatus.CORRECTION_REQUIRED) {
        blockers.push(`Requirement "${req.name}" was rejected or requires correction (${req.rejectionReason || "Action required"}).`);
      } else if (req.required && !req.isSatisfied) {
        blockers.push(`Mandatory requirement "${req.name}" is pending submission.`);
      }

      // Check linked documents
      for (const doc of req.documents) {
        if (doc.status === DocumentStatus.REJECTED) {
          rejectedDocsCount++;
        } else if (doc.status === DocumentStatus.PENDING_REVIEW || doc.status === DocumentStatus.UPLOADED) {
          pendingDocsCount++;
        } else if (doc.status === DocumentStatus.APPROVED) {
          approvedDocsCount++;
        }
      }
    }

    if (rejectedDocsCount > 0) {
      blockers.push(`${rejectedDocsCount} uploaded document(s) have been rejected and require replacement.`);
    }

    if (pendingDocsCount > 0) {
      warnings.push(`${pendingDocsCount} document(s) are awaiting administrative review.`);
    }

    // 2. Financial / Payment evaluation
    const outstandingDec = Number(app.dueAmount);
    const paidDec = Number(app.paidAmount);
    const totalDec = Number(app.totalAmount);
    const isPaymentComplete = outstandingDec <= 0;

    if (app.service.requiresPayment && outstandingDec > 0) {
      if (paidDec === 0) {
        blockers.push(`Application invoice is unpaid (Outstanding: ${app.currency} ${outstandingDec.toFixed(2)}).`);
      } else {
        warnings.push(`Application invoice is partially paid (Outstanding balance: ${app.currency} ${outstandingDec.toFixed(2)}).`);
      }
    }

    // 3. Quality Check evaluation
    const latestQc = app.qualityChecks[0];
    const qcPassed = latestQc?.result === QCResult.PASSED;

    // 4. Government Processing evaluation
    const latestGov = app.governmentApps[0];
    const govStatus = latestGov ? latestGov.status : null;

    const ready = blockers.length === 0;

    return {
      ready,
      blockers,
      warnings,
      completedRequirements: completedCount,
      totalRequirements,
      requiredRequirements: requiredCount,
      satisfiedRequiredRequirements: satisfiedRequiredCount,
      rejectedDocuments: rejectedDocsCount,
      pendingDocuments: pendingDocsCount,
      approvedDocuments: approvedDocsCount,
      outstandingAmount: outstandingDec.toFixed(2),
      paidAmount: paidDec.toFixed(2),
      totalAmount: totalDec.toFixed(2),
      isPaymentComplete,
      qualityCheckPassed: qcPassed,
      governmentProcessingStatus: govStatus,
    };
  }

  /**
   * Validate whether an application can legally and operationally transition to target status
   */
  async validateTransitionPrerequisites(
    applicationId: string,
    targetStatus: ApplicationStatus,
    organizationId?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const report = await this.evaluateReadiness(applicationId, organizationId);

    switch (targetStatus) {
      case ApplicationStatus.READY_FOR_SUBMISSION: {
        if (report.requiredRequirements > report.satisfiedRequiredRequirements) {
          return {
            allowed: false,
            reason: `Cannot move to READY_FOR_SUBMISSION: ${report.requiredRequirements - report.satisfiedRequiredRequirements} required requirement(s) are not yet satisfied/approved.`,
          };
        }
        if (report.rejectedDocuments > 0) {
          return {
            allowed: false,
            reason: `Cannot move to READY_FOR_SUBMISSION: ${report.rejectedDocuments} rejected document(s) must be replaced and approved.`,
          };
        }
        if (report.pendingDocuments > 0) {
          return {
            allowed: false,
            reason: `Cannot move to READY_FOR_SUBMISSION: ${report.pendingDocuments} document(s) are still pending administrative review.`,
          };
        }
        return { allowed: true };
      }

      case ApplicationStatus.SUBMITTED:
      case ApplicationStatus.GOVERNMENT_PROCESSING: {
        if (report.requiredRequirements > report.satisfiedRequiredRequirements) {
          return {
            allowed: false,
            reason: `Cannot submit to government: ${report.requiredRequirements - report.satisfiedRequiredRequirements} required requirement(s) are not yet satisfied/approved.`,
          };
        }
        if (report.rejectedDocuments > 0) {
          return {
            allowed: false,
            reason: `Cannot submit to government: ${report.rejectedDocuments} rejected document(s) must be replaced and approved.`,
          };
        }
        if (report.pendingDocuments > 0) {
          return {
            allowed: false,
            reason: `Cannot submit to government: ${report.pendingDocuments} document(s) are still pending administrative review.`,
          };
        }
        return { allowed: true };
      }

      case ApplicationStatus.DOCUMENT_RECEIVED:
      case ApplicationStatus.APPROVED: {
        return { allowed: true };
      }

      case ApplicationStatus.READY_FOR_DELIVERY: {
        if (!report.qualityCheckPassed) {
          return {
            allowed: false,
            reason: "Cannot move to READY_FOR_DELIVERY: Application must pass a formal Quality Check before delivery.",
          };
        }
        return { allowed: true };
      }

      case ApplicationStatus.DELIVERED: {
        if (!report.qualityCheckPassed) {
          return {
            allowed: false,
            reason: "Cannot deliver application: Quality Check has not passed.",
          };
        }
        return { allowed: true };
      }

      case ApplicationStatus.CLOSED: {
        if (!report.isPaymentComplete) {
          return {
            allowed: false,
            reason: `Cannot close application: Outstanding balance of ${report.outstandingAmount} must be settled.`,
          };
        }
        return { allowed: true };
      }

      default:
        return { allowed: true };
    }
  }
}

export const applicationReadinessService = new ApplicationReadinessService();
