import { prisma } from "../../infrastructure/database/prisma.js";
import {
  GovernmentStatus,
  UserRole,
  NoteVisibility,
  ApplicationStatus,
  ClientActionType,
  ClientActionStatus,
  ApplicationPriority,
  SlaEventCategory,
  SlaEventType,
} from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export interface CreateGovernmentRecordInput {
  platform: string;
  governmentAgency: string;
  governmentService?: string;
  externalReference: string;
  trackingNumber?: string;
  status?: GovernmentStatus;
  statusDescription?: string;
  portalUrl?: string;
  nextFollowUpDate?: Date;
  expectedCompletionAt?: Date;
  notes?: string;
  evidenceDocumentUrl?: string;
  references?: Array<{
    referenceType: string;
    referenceValue: string;
    issuingPlatform?: string;
    metadata?: any;
  }>;
}

export interface UpdateGovernmentStatusInput {
  status: GovernmentStatus;
  statusDescription?: string;
  externalReference?: string;
  trackingNumber?: string;
  notes?: string;
  rejectionReason?: string;
  evidenceDocumentUrl?: string;
  portalUrl?: string;
  approvalDate?: Date;
  completionDate?: Date;
  expectedCompletionAt?: Date;
  source?: string;
}

export interface RequestAdditionalInfoInput {
  description: string;
  deadline?: Date;
  clientActionType: ClientActionType;
  clientActionTitle: string;
  clientActionDescription: string;
  requirementId?: string;
  notes?: string;
}

export interface ResubmitGovernmentInput {
  notes?: string;
  externalReference?: string;
  trackingNumber?: string;
  expectedCompletionAt?: Date;
  evidenceDocumentUrl?: string;
}

export interface RecordApprovalInput {
  approvalDate?: Date;
  completionDate?: Date;
  evidenceDocumentUrl?: string;
  notes?: string;
  certificateDocumentId?: string;
}

export interface GovernmentQueueFilter {
  agency?: string;
  platform?: string;
  status?: GovernmentStatus;
  followUpDue?: boolean;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export class GovernmentProcessingService {
  /**
   * Create government submission tracking record
   */
  async createRecord(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: CreateGovernmentRecordInput
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    if (!app) {
      throw new NotFoundError("Application");
    }

    const initialStatus = data.status || GovernmentStatus.PREPARING;
    const now = new Date();

    const record = await prisma.$transaction(async (tx) => {
      const govApp = await tx.governmentApplication.create({
        data: {
          applicationId,
          platform: data.platform,
          governmentAgency: data.governmentAgency,
          governmentService: data.governmentService || app.service.name,
          externalReference: data.externalReference,
          trackingNumber: data.trackingNumber || null,
          status: initialStatus,
          statusDescription: data.statusDescription || `Initial submission registered on ${data.platform}`,
          submittedAt: initialStatus === GovernmentStatus.SUBMITTED || initialStatus === GovernmentStatus.UNDER_PROCESSING ? now : null,
          submittedByAdminId: adminId,
          lastCheckedAt: now,
          nextFollowUpDate: data.nextFollowUpDate || null,
          expectedCompletionAt: data.expectedCompletionAt || null,
          portalUrl: data.portalUrl || null,
          notes: data.notes || null,
          evidenceDocumentUrl: data.evidenceDocumentUrl || null,
        },
      });

      // Add supplementary references if provided
      if (data.references && data.references.length > 0) {
        for (const ref of data.references) {
          await tx.governmentReference.create({
            data: {
              governmentApplicationId: govApp.id,
              referenceType: ref.referenceType,
              referenceValue: ref.referenceValue,
              issuingPlatform: ref.issuingPlatform || data.platform,
              metadata: ref.metadata || undefined,
            },
          });
        }
      }

      // Create primary reference if not already included
      if (data.externalReference) {
        await tx.governmentReference.create({
          data: {
            governmentApplicationId: govApp.id,
            referenceType: `${data.governmentAgency.toUpperCase()}_REF`,
            referenceValue: data.externalReference,
            issuingPlatform: data.platform,
          },
        });
      }

      // Create first status history entry
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: govApp.id,
          fromStatus: null,
          toStatus: initialStatus,
          statusDescription: govApp.statusDescription,
          notes: data.notes || "Initial record creation",
          changedById: adminId,
          source: "ADMIN",
          externalReference: data.externalReference,
        },
      });

      // Log ApplicationActivity
      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "GOVERNMENT_SUBMISSION",
          entityType: "GovernmentApplication",
          entityId: govApp.id,
          toStatus: initialStatus,
          message: `Government submission recorded for ${data.governmentAgency} (${data.platform}). Ref: ${data.externalReference}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // Log SLA Event if submitted
      if (initialStatus === GovernmentStatus.SUBMITTED || initialStatus === GovernmentStatus.UNDER_PROCESSING) {
        await tx.applicationSlaEvent.create({
          data: {
            applicationId,
            eventType: SlaEventType.STATUS_CHANGE,
            category: SlaEventCategory.GOVERNMENT_WAITING,
            reason: `Government processing initiated with ${data.governmentAgency} (${data.platform})`,
            actorId: adminId,
            actorRole: UserRole.ADMIN,
          },
        });
      }

      return govApp;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_RECORD_CREATED",
      resource: "GovernmentApplication",
      resourceId: record.id,
      metadata: {
        agency: data.governmentAgency,
        externalReference: data.externalReference,
        status: initialStatus,
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
      void notificationOrchestrator.notifyGovernmentUpdate(ctx, {
        agency: data.governmentAgency,
        externalReference: data.externalReference,
        status: initialStatus,
        statusDescription: record.statusDescription || undefined,
      });
    }

    return record;
  }

  /**
   * Update government application status with full history tracking & SLA event recording
   */
  async updateStatus(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: UpdateGovernmentStatusInput
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!govApp) {
      throw new NotFoundError("Government application record");
    }

    const previousStatus = govApp.status;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedGov = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: data.status,
          statusDescription: data.statusDescription || `Status changed to ${data.status}`,
          externalReference: data.externalReference || govApp.externalReference,
          trackingNumber: data.trackingNumber || govApp.trackingNumber,
          lastCheckedAt: now,
          rejectionReason:
            data.status === GovernmentStatus.REJECTED ||
            data.status === GovernmentStatus.ACTION_REQUIRED ||
            data.status === GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED
              ? data.rejectionReason
              : govApp.rejectionReason,
          rejectedAt: data.status === GovernmentStatus.REJECTED ? now : govApp.rejectedAt,
          approvalDate: data.status === GovernmentStatus.APPROVED ? data.approvalDate || now : govApp.approvalDate,
          completionDate: data.status === GovernmentStatus.COMPLETED ? data.completionDate || now : govApp.completionDate,
          completedAt: data.status === GovernmentStatus.COMPLETED || data.status === GovernmentStatus.APPROVED ? now : govApp.completedAt,
          evidenceDocumentUrl: data.evidenceDocumentUrl || govApp.evidenceDocumentUrl,
          portalUrl: data.portalUrl || govApp.portalUrl,
          expectedCompletionAt: data.expectedCompletionAt || govApp.expectedCompletionAt,
          notes: data.notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[${now.toISOString()}] ${data.notes}` : govApp.notes,
        },
      });

      // Record in GovernmentStatusHistory
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: previousStatus,
          toStatus: data.status,
          statusDescription: updatedGov.statusDescription,
          notes: data.notes || data.rejectionReason || `Updated to ${data.status}`,
          changedById: adminId,
          source: data.source || "ADMIN",
          externalReference: updatedGov.externalReference,
        },
      });

      // Log ApplicationActivity
      await tx.applicationActivity.create({
        data: {
          applicationId: govApp.applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "GOVERNMENT_STATUS_UPDATE",
          entityType: "GovernmentApplication",
          entityId: governmentRecordId,
          fromStatus: previousStatus,
          toStatus: data.status,
          message: `Government processing update from ${govApp.governmentAgency}: Status is now ${data.status}${data.statusDescription ? ` (${data.statusDescription})` : ""}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // Log SLA Event
      const slaCategory =
        data.status === GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED || data.status === GovernmentStatus.ACTION_REQUIRED
          ? SlaEventCategory.CLIENT_WAITING
          : data.status === GovernmentStatus.UNDER_PROCESSING || data.status === GovernmentStatus.SUBMITTED
          ? SlaEventCategory.GOVERNMENT_WAITING
          : SlaEventCategory.INTERNAL;

      await tx.applicationSlaEvent.create({
        data: {
          applicationId: govApp.applicationId,
          eventType: SlaEventType.STATUS_CHANGE,
          category: slaCategory,
          reason: `Government status updated: ${previousStatus} -> ${data.status}`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      return updatedGov;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_STATUS_UPDATED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: {
        fromStatus: previousStatus,
        toStatus: data.status,
        agency: govApp.governmentAgency,
        reference: updated.externalReference,
      },
    });

    // Notify Client
    const client = govApp.application.client;
    if (client.user) {
      const ctx: BaseNotificationContext = {
        organizationId,
        applicationId: govApp.application.id,
        applicationNumber: govApp.application.applicationNumber,
        serviceName: govApp.application.service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };
      void notificationOrchestrator.notifyGovernmentUpdate(ctx, {
        agency: govApp.governmentAgency,
        externalReference: updated.externalReference || undefined,
        status: data.status,
        statusDescription: updated.statusDescription || undefined,
      });
    }

    return updated;
  }

  /**
   * Request Additional Information from Client triggered by Government Query
   */
  async requestAdditionalInformation(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: RequestAdditionalInfoInput
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!govApp) {
      throw new NotFoundError("Government application record");
    }

    const now = new Date();
    const deadline = data.deadline || new Date(Date.now() + 72 * 60 * 60 * 1000); // Default 72 hours

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update GovernmentApplication
      const updatedGov = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED,
          statusDescription: `Government requested additional info: ${data.description}`,
          additionalInformationRequired: true,
          additionalInformationRequestedAt: now,
          additionalInformationDeadline: deadline,
          notes: data.notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[${now.toISOString()}] Information request: ${data.notes}` : govApp.notes,
        },
      });

      // 2. Create ClientAction
      const clientAction = await tx.clientAction.create({
        data: {
          organizationId,
          applicationId: govApp.applicationId,
          requirementId: data.requirementId || null,
          type: data.clientActionType,
          title: data.clientActionTitle,
          description: data.clientActionDescription,
          priority: ApplicationPriority.HIGH,
          dueAt: deadline,
          status: ClientActionStatus.OPEN,
          createdById: adminId,
        },
      });

      // 3. Update Application Status to ADDITIONAL_INFORMATION_REQUIRED
      await tx.application.update({
        where: { id: govApp.applicationId },
        data: {
          status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
          pausedAt: now,
        },
      });

      // 4. Record Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED,
          statusDescription: `Additional information requested: ${data.description}`,
          notes: data.notes,
          changedById: adminId,
          source: "ADMIN",
        },
      });

      // 5. Application Activity
      await tx.applicationActivity.create({
        data: {
          applicationId: govApp.applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "ADDITIONAL_INFORMATION_REQUESTED",
          entityType: "ClientAction",
          entityId: clientAction.id,
          toStatus: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
          message: `Government query on ${govApp.governmentAgency}: Action required from client - "${data.clientActionTitle}"`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // 6. Application SLA Event
      await tx.applicationSlaEvent.create({
        data: {
          applicationId: govApp.applicationId,
          eventType: SlaEventType.PAUSED,
          category: SlaEventCategory.CLIENT_WAITING,
          reason: `Government query awaiting client response: ${data.clientActionTitle}`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      return { updatedGov, clientAction };
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_ADDITIONAL_INFO_REQUESTED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: {
        clientActionId: result.clientAction.id,
        deadline,
        type: data.clientActionType,
      },
    });

    // Notify Client
    const client = govApp.application.client;
    if (client.user) {
      const ctx: BaseNotificationContext = {
        organizationId,
        applicationId: govApp.application.id,
        applicationNumber: govApp.application.applicationNumber,
        serviceName: govApp.application.service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };
      void notificationOrchestrator.notifyClientActionRequired(ctx, {
        actionTitle: data.clientActionTitle,
        actionDescription: data.clientActionDescription,
        deadline,
      });
    }

    return result;
  }

  /**
   * Resubmit Application to Government after Client Correction
   */
  async resubmitGovernment(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: ResubmitGovernmentInput
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!govApp) {
      throw new NotFoundError("Government application record");
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update Government Application
      const updatedGov = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: GovernmentStatus.RESUBMITTED,
          statusDescription: `Resubmitted to ${govApp.governmentAgency}`,
          additionalInformationRequired: false,
          externalReference: data.externalReference || govApp.externalReference,
          trackingNumber: data.trackingNumber || govApp.trackingNumber,
          expectedCompletionAt: data.expectedCompletionAt || govApp.expectedCompletionAt,
          evidenceDocumentUrl: data.evidenceDocumentUrl || govApp.evidenceDocumentUrl,
          lastCheckedAt: now,
          notes: data.notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[${now.toISOString()}] Resubmission: ${data.notes}` : govApp.notes,
        },
      });

      // 2. Transition Application Status back to GOVERNMENT_PROCESSING
      await tx.application.update({
        where: { id: govApp.applicationId },
        data: {
          status: ApplicationStatus.GOVERNMENT_PROCESSING,
          pausedAt: null,
        },
      });

      // 3. Government Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.RESUBMITTED,
          statusDescription: "Application resubmitted to government agency",
          notes: data.notes,
          changedById: adminId,
          source: "ADMIN",
        },
      });

      // 4. Application Activity
      await tx.applicationActivity.create({
        data: {
          applicationId: govApp.applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "GOVERNMENT_RESUBMISSION",
          entityType: "GovernmentApplication",
          entityId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.RESUBMITTED,
          message: `Application successfully resubmitted to ${govApp.governmentAgency}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // 5. Resume SLA
      await tx.applicationSlaEvent.create({
        data: {
          applicationId: govApp.applicationId,
          eventType: SlaEventType.RESUMED,
          category: SlaEventCategory.GOVERNMENT_WAITING,
          reason: `Application resubmitted to ${govApp.governmentAgency}`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      return updatedGov;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_RESUBMITTED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: {
        agency: govApp.governmentAgency,
        reference: updated.externalReference,
      },
    });

    return updated;
  }

  /**
   * Record Government Approval / Clearance & Complete Government Phase
   */
  async recordApproval(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: RecordApprovalInput
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: {
        application: {
          include: {
            client: { include: { user: true } },
            service: true,
          },
        },
      },
    });

    if (!govApp) {
      throw new NotFoundError("Government application record");
    }

    const now = new Date();
    const approvalDate = data.approvalDate || now;
    const completionDate = data.completionDate || now;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Government Application
      const updatedGov = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: GovernmentStatus.APPROVED,
          statusDescription: `Approved by ${govApp.governmentAgency}`,
          approvalDate,
          completionDate,
          completedAt: completionDate,
          evidenceDocumentUrl: data.evidenceDocumentUrl || govApp.evidenceDocumentUrl,
          notes: data.notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[${now.toISOString()}] Approved: ${data.notes}` : govApp.notes,
        },
      });

      // 2. Transition Application Status to DOCUMENT_RECEIVED or QUALITY_CHECK
      await tx.application.update({
        where: { id: govApp.applicationId },
        data: {
          status: ApplicationStatus.DOCUMENT_RECEIVED,
        },
      });

      // 3. Government Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.APPROVED,
          statusDescription: `Approved and verified by ${govApp.governmentAgency}`,
          notes: data.notes,
          changedById: adminId,
          source: "ADMIN",
        },
      });

      // 4. Application Activity
      await tx.applicationActivity.create({
        data: {
          applicationId: govApp.applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "GOVERNMENT_APPROVAL",
          entityType: "GovernmentApplication",
          entityId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.APPROVED,
          message: `Official approval granted by ${govApp.governmentAgency}. Official certificate received.`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      // 5. Sla Event (Government Phase Complete)
      await tx.applicationSlaEvent.create({
        data: {
          applicationId: govApp.applicationId,
          eventType: SlaEventType.STATUS_CHANGE,
          category: SlaEventCategory.INTERNAL,
          reason: `Government approval confirmed. Internal processing for delivery / quality check resumed.`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
        },
      });

      return updatedGov;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_APPROVED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: {
        agency: govApp.governmentAgency,
        approvalDate,
      },
    });

    // Notify Client
    const client = govApp.application.client;
    if (client.user) {
      const ctx: BaseNotificationContext = {
        organizationId,
        applicationId: govApp.application.id,
        applicationNumber: govApp.application.applicationNumber,
        serviceName: govApp.application.service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };
      void notificationOrchestrator.notifyGovernmentUpdate(ctx, {
        agency: govApp.governmentAgency,
        externalReference: govApp.externalReference || undefined,
        status: GovernmentStatus.APPROVED,
        statusDescription: `Official approval granted by ${govApp.governmentAgency}`,
      });
    }

    return result;
  }

  /**
   * Add a supplementary external reference to a government application
   */
  async addReference(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    data: { referenceType: string; referenceValue: string; issuingPlatform?: string; metadata?: any }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const ref = await prisma.governmentReference.create({
      data: {
        governmentApplicationId: governmentRecordId,
        referenceType: data.referenceType,
        referenceValue: data.referenceValue,
        issuingPlatform: data.issuingPlatform || govApp.platform,
        metadata: data.metadata || undefined,
      },
    });

    return ref;
  }

  /**
   * Remove a supplementary reference
   */
  async removeReference(governmentRecordId: string, referenceId: string, organizationId: string, adminId: string) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const ref = await prisma.governmentReference.findFirst({
      where: { id: referenceId, governmentApplicationId: governmentRecordId },
    });

    if (!ref) throw new NotFoundError("Government reference");

    await prisma.governmentReference.delete({
      where: { id: referenceId },
    });

    return { success: true };
  }

  /**
   * Schedule next government follow-up date
   */
  async scheduleFollowUp(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    nextFollowUpDate: Date,
    notes?: string
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const updated = await prisma.governmentApplication.update({
      where: { id: governmentRecordId },
      data: {
        nextFollowUpDate,
        notes: notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[Follow-up scheduled: ${nextFollowUpDate.toISOString()}] ${notes}` : govApp.notes,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_FOLLOWUP_SCHEDULED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: { nextFollowUpDate, notes },
    });

    return updated;
  }

  /**
   * View complete government status history
   */
  async getStatusHistory(governmentRecordId: string, organizationId: string) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    return prisma.governmentStatusHistory.findMany({
      where: { governmentApplicationId: governmentRecordId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Admin: Government Work Queue with multi-facet filters & counts
   */
  async getGovernmentQueue(organizationId: string, filters: GovernmentQueueFilter) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      application: { organizationId, deletedAt: null },
    };

    if (filters.agency) {
      where.governmentAgency = { equals: filters.agency, mode: "insensitive" };
    }
    if (filters.platform) {
      where.platform = { equals: filters.platform, mode: "insensitive" };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.followUpDue === true) {
      where.nextFollowUpDate = { lte: new Date() };
    }
    if (filters.overdue === true) {
      where.expectedCompletionAt = { lte: new Date() };
      where.status = { notIn: [GovernmentStatus.APPROVED, GovernmentStatus.COMPLETED, GovernmentStatus.CANCELLED] };
    }

    const [items, total] = await Promise.all([
      prisma.governmentApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nextFollowUpDate: "asc" }, { updatedAt: "desc" }],
        include: {
          application: {
            select: {
              id: true,
              applicationNumber: true,
              status: true,
              priority: true,
              client: { select: { id: true, fullName: true, email: true, phone: true } },
              service: { select: { id: true, name: true, code: true } },
            },
          },
          references: true,
        },
      }),
      prisma.governmentApplication.count({ where }),
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

  /**
   * Client-Safe Tracking View (sanitized, no internal admin follow-up notes or internal links)
   */
  async getClientGovernmentTracking(applicationId: string, organizationId: string, clientId: string) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, clientId, deletedAt: null },
      include: {
        governmentApps: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            platform: true,
            governmentAgency: true,
            governmentService: true,
            externalReference: true,
            trackingNumber: true,
            status: true,
            statusDescription: true,
            lastCheckedAt: true,
            expectedCompletionAt: true,
            approvalDate: true,
            completionDate: true,
            createdAt: true,
            references: {
              select: {
                referenceType: true,
                referenceValue: true,
                issuingPlatform: true,
              },
            },
            statusHistory: {
              orderBy: { createdAt: "desc" },
              select: {
                fromStatus: true,
                toStatus: true,
                statusDescription: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!app) throw new NotFoundError("Application");

    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      governmentApplications: app.governmentApps,
    };
  }
}

export const governmentProcessingService = new GovernmentProcessingService();
