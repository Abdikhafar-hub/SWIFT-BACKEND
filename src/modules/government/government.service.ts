import { prisma } from "../../infrastructure/database/prisma.js";
import {
  GovernmentStatus,
  GovernmentSubmissionChannel,
  GovernmentQueryType,
  GovernmentQuerySeverity,
  GovernmentPaymentStatus,
  GovernmentAppointmentType,
  GovernmentAppointmentStatus,
  GovernmentFollowUpMethod,
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
import { applicationReadinessService } from "../applications/application-readiness.service.js";

export interface GovernmentQueueFilter {
  agency?: string;
  platform?: string;
  status?: GovernmentStatus;
  channel?: GovernmentSubmissionChannel;
  officerId?: string;
  priority?: string;
  paymentStatus?: GovernmentPaymentStatus;
  appointmentStatus?: GovernmentAppointmentStatus;
  followUpDue?: boolean;
  overdue?: boolean;
  tabView?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class GovernmentProcessingService {
  /**
   * Get Real-time Database KPI Aggregates for Admin Government Dashboard
   */
  async getGovernmentDashboardKpis(organizationId: string) {
    const baseWhere = {
      application: { organizationId, deletedAt: null },
    };

    const now = new Date();

    const [
      totalActive,
      readyForSubmission,
      awaitingResponse,
      queryRequired,
      paymentRequired,
      appointmentsScheduled,
      approvedReady,
      overdueSlaRisk,
    ] = await Promise.all([
      // 1. Active Government Cases
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: {
            notIn: [
              GovernmentStatus.APPROVED,
              GovernmentStatus.COLLECTED,
              GovernmentStatus.CLOSED,
              GovernmentStatus.REJECTED,
              GovernmentStatus.WITHDRAWN,
              GovernmentStatus.CANCELLED,
            ],
          },
        },
      }),

      // 2. Ready for Submission / Preparing
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: { in: [GovernmentStatus.READY_TO_SUBMIT, GovernmentStatus.PREPARING, GovernmentStatus.NOT_STARTED] },
        },
      }),

      // 3. Awaiting Government Response
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: {
            in: [
              GovernmentStatus.SUBMITTED,
              GovernmentStatus.SUBMISSION_IN_PROGRESS,
              GovernmentStatus.UNDER_PROCESSING,
              GovernmentStatus.ACKNOWLEDGED,
            ],
          },
        },
      }),

      // 4. Government Query / Correction Required
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: {
            in: [
              GovernmentStatus.QUERY_RAISED,
              GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED,
              GovernmentStatus.CORRECTION_REQUIRED,
            ],
          },
        },
      }),

      // 5. Payment Required
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          OR: [
            { status: { in: [GovernmentStatus.PAYMENT_REQUIRED, GovernmentStatus.PAYMENT_PENDING] } },
            { statutoryPaymentStatus: { in: [GovernmentPaymentStatus.REQUIRED, GovernmentPaymentStatus.AWAITING_PAYMENT] } },
          ],
        },
      }),

      // 6. Appointments & Biometrics Scheduled
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          OR: [
            {
              status: {
                in: [
                  GovernmentStatus.APPOINTMENT_REQUIRED,
                  GovernmentStatus.BIOMETRICS_REQUIRED,
                  GovernmentStatus.INTERVIEW_REQUIRED,
                ],
              },
            },
            { appointments: { some: { status: GovernmentAppointmentStatus.SCHEDULED } } },
          ],
        },
      }),

      // 7. Approved & Ready for Collection / Delivery
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: {
            in: [
              GovernmentStatus.APPROVED,
              GovernmentStatus.CERTIFICATE_READY,
              GovernmentStatus.READY_FOR_COLLECTION,
            ],
          },
        },
      }),

      // 8. Overdue / SLA Risk Cases
      prisma.governmentApplication.count({
        where: {
          ...baseWhere,
          status: {
            notIn: [
              GovernmentStatus.APPROVED,
              GovernmentStatus.COLLECTED,
              GovernmentStatus.CLOSED,
              GovernmentStatus.REJECTED,
              GovernmentStatus.WITHDRAWN,
              GovernmentStatus.CANCELLED,
            ],
          },
          OR: [
            { expectedResponseDate: { lte: now } },
            { nextFollowUpDate: { lte: now } },
            { expectedCompletionAt: { lte: now } },
          ],
        },
      }),
    ]);

    return {
      totalActive,
      readyForSubmission,
      awaitingResponse,
      queryRequired,
      paymentRequired,
      appointmentsScheduled,
      approvedReady,
      overdueSlaRisk,
    };
  }

  /**
   * Fetch Applications Evaluated for Government Submission Readiness
   */
  async getReadyApplicationsForSubmission(organizationId: string, search?: string) {
    const where: any = {
      organizationId,
      deletedAt: null,
      status: {
        in: [
          ApplicationStatus.DOCUMENT_REVIEW,
          ApplicationStatus.READY_FOR_SUBMISSION,
          ApplicationStatus.DOCUMENT_RECEIVED,
          ApplicationStatus.SUBMITTED,
        ],
      },
    };

    if (search) {
      where.OR = [
        { applicationNumber: { contains: search, mode: "insensitive" } },
        { client: { fullName: { contains: search, mode: "insensitive" } } },
        { client: { email: { contains: search, mode: "insensitive" } } },
        { service: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const apps = await prisma.application.findMany({
      where,
      take: 50,
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { id: true, fullName: true, email: true, phone: true } },
        service: { select: { id: true, name: true, code: true, category: true } },
        assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
        governmentApps: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const evaluatedApps = await Promise.all(
      apps.map(async (app) => {
        const readiness = await applicationReadinessService.evaluateReadiness(app.id, organizationId);
        return {
          id: app.id,
          applicationNumber: app.applicationNumber,
          status: app.status,
          client: app.client,
          service: app.service,
          assignedAdmin: app.assignedAdmin,
          latestGovApp: app.governmentApps[0] || null,
          readiness,
        };
      })
    );

    return evaluatedApps;
  }

  /**
   * Create a Comprehensive Government Submission Record
   */
  async createGovernmentSubmission(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      platform: string;
      governmentAgency: string;
      governmentService?: string;
      department?: string;
      submissionChannel?: GovernmentSubmissionChannel;
      externalReference: string;
      trackingNumber?: string;
      receiptNumber?: string;
      officerContact?: string;
      portalUrl?: string;
      status?: GovernmentStatus;
      statusDescription?: string;
      submittedAt?: Date;
      expectedTurnaroundDays?: number;
      expectedResponseDate?: Date;
      nextFollowUpDate?: Date;
      followUpFrequencyDays?: number;
      primaryOfficerId?: string;
      secondaryOfficerId?: string;
      supervisorId?: string;
      team?: string;
      statutoryPaymentStatus?: GovernmentPaymentStatus;
      statutoryFeeAmount?: number;
      notes?: string;
      evidenceDocumentUrl?: string;
      overridePrerequisites?: boolean;
      references?: Array<{ referenceType: string; referenceValue: string; issuingPlatform?: string; metadata?: any }>;
    }
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: { client: true, service: true },
    });

    if (!app) throw new NotFoundError("Application");

    // Enforce Readiness Validation unless explicitly overridden
    if (!data.overridePrerequisites) {
      const readiness = await applicationReadinessService.evaluateReadiness(applicationId, organizationId);
      if (!readiness.ready) {
        throw new BadRequestError(
          `Application is not ready for government submission. Blockers: ${readiness.blockers.join(" | ")}`
        );
      }
    }

    const initialStatus = data.status || GovernmentStatus.SUBMITTED;
    const now = new Date();
    const submissionDate = data.submittedAt ? new Date(data.submittedAt) : now;

    // Calculate expected response date if turnaround days given
    let responseDate = data.expectedResponseDate ? new Date(data.expectedResponseDate) : undefined;
    if (!responseDate && data.expectedTurnaroundDays) {
      responseDate = new Date(submissionDate.getTime() + data.expectedTurnaroundDays * 86400000);
    }

    // Default next follow-up date (7 days if not provided)
    const followUpFreq = data.followUpFrequencyDays || 7;
    const followUpDate = data.nextFollowUpDate
      ? new Date(data.nextFollowUpDate)
      : new Date(now.getTime() + followUpFreq * 86400000);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Government Application Record
      const govApp = await tx.governmentApplication.create({
        data: {
          applicationId,
          platform: data.platform,
          governmentAgency: data.governmentAgency || "eCitizen",
          governmentService: data.governmentService || app.service.name,
          department: data.department,
          submissionChannel: data.submissionChannel || GovernmentSubmissionChannel.ONLINE_PORTAL,
          externalReference: data.externalReference,
          trackingNumber: data.trackingNumber,
          receiptNumber: data.receiptNumber,
          officerContact: data.officerContact,
          portalUrl: data.portalUrl,
          submittedAt: submissionDate,
          submittedByAdminId: adminId,
          primaryOfficerId: data.primaryOfficerId || adminId,
          secondaryOfficerId: data.secondaryOfficerId,
          supervisorId: data.supervisorId,
          team: data.team,
          status: initialStatus,
          statusDescription: data.statusDescription || `Submitted to ${data.governmentAgency} (${data.platform})`,
          lastCheckedAt: now,
          expectedTurnaroundDays: data.expectedTurnaroundDays,
          expectedResponseDate: responseDate,
          nextFollowUpDate: followUpDate,
          followUpFrequencyDays: followUpFreq,
          lastFollowUpDate: now,
          followUpOwnerId: data.primaryOfficerId || adminId,
          statutoryPaymentStatus: data.statutoryPaymentStatus || GovernmentPaymentStatus.NOT_REQUIRED,
          statutoryFeeAmount: data.statutoryFeeAmount || 0,
          evidenceDocumentUrl: data.evidenceDocumentUrl,
          notes: data.notes,
        },
      });

      // 2. Add References if provided
      if (data.references && data.references.length > 0) {
        await tx.governmentReference.createMany({
          data: data.references.map((ref) => ({
            governmentApplicationId: govApp.id,
            referenceType: ref.referenceType,
            referenceValue: ref.referenceValue,
            issuingPlatform: ref.issuingPlatform || data.platform,
            metadata: ref.metadata,
          })),
        });
      }

      // Add Primary Ref
      await tx.governmentReference.create({
        data: {
          governmentApplicationId: govApp.id,
          referenceType: `${data.platform.toUpperCase()}_REF`,
          referenceValue: data.externalReference,
          issuingPlatform: data.platform,
        },
      });

      // 3. Initial Evidence Document if provided
      if (data.evidenceDocumentUrl) {
        await tx.governmentEvidence.create({
          data: {
            governmentApplicationId: govApp.id,
            documentName: `Submission Acknowledgement - ${data.externalReference}`,
            documentType: "ACKNOWLEDGEMENT",
            fileUrl: data.evidenceDocumentUrl,
            uploadedById: adminId,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      // 4. Record Initial Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: govApp.id,
          fromStatus: null,
          toStatus: initialStatus,
          statusDescription: data.statusDescription || `Initial submission registered on ${data.platform}`,
          notes: data.notes,
          changedById: adminId,
          source: "ADMIN",
          externalReference: data.externalReference,
        },
      });

      // 5. Update Host Application Status to SUBMITTED
      await tx.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.SUBMITTED,
          updatedAt: now,
        },
      });

      // 6. Log SLA Timing Event
      await tx.applicationSlaEvent.create({
        data: {
          applicationId,
          eventType: SlaEventType.STATUS_CHANGE,
          category: SlaEventCategory.GOVERNMENT_WAITING,
          reason: `Government submission created (${data.governmentAgency} - Ref: ${data.externalReference})`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          metadata: {
            govAppId: govApp.id,
            platform: data.platform,
            externalReference: data.externalReference,
            status: initialStatus,
          },
        },
      });

      return govApp;
    });

    // 7. Audit Log
    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_SUBMISSION_CREATED",
      resource: "GovernmentApplication",
      resourceId: result.id,
      metadata: {
        applicationId,
        platform: data.platform,
        externalReference: data.externalReference,
        channel: data.submissionChannel,
      },
    });

    // 8. Dispatch Notification to Client
    const notifyCtx: BaseNotificationContext = {
      organizationId,
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      serviceName: app.service.name,
      clientUserId: app.clientId,
      clientName: app.client.fullName,
      clientEmail: app.client.email,
      clientPhone: app.client.phone || "",
    };

    await notificationOrchestrator.notifyGovernmentUpdate(notifyCtx, {
      agency: data.governmentAgency,
      externalReference: data.externalReference,
      status: initialStatus,
      statusDescription: data.statusDescription || `Application submitted to ${data.governmentAgency}`,
    });

    return result;
  }

  /**
   * Update Government Status & Execute Lifecycle Transitions
   */
  async updateStatus(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
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
      followUpDate?: Date;
      source?: string;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: { application: { include: { client: true, service: true } } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const oldStatus = govApp.status;
    const newStatus = data.status;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: newStatus,
        statusDescription: data.statusDescription || `Status changed from ${oldStatus} to ${newStatus}`,
        lastCheckedAt: now,
        notes: data.notes ? `${govApp.notes ? govApp.notes + "\n" : ""}[${now.toISOString()}] ${data.notes}` : govApp.notes,
      };

      if (data.externalReference) updateData.externalReference = data.externalReference;
      if (data.trackingNumber) updateData.trackingNumber = data.trackingNumber;
      if (data.portalUrl) updateData.portalUrl = data.portalUrl;
      if (data.evidenceDocumentUrl) updateData.evidenceDocumentUrl = data.evidenceDocumentUrl;
      if (data.expectedCompletionAt) updateData.expectedCompletionAt = new Date(data.expectedCompletionAt);
      if (data.followUpDate) updateData.nextFollowUpDate = new Date(data.followUpDate);

      // Transition specific field updates
      if (newStatus === GovernmentStatus.APPROVED || newStatus === GovernmentStatus.CERTIFICATE_READY) {
        updateData.approvalDate = data.approvalDate ? new Date(data.approvalDate) : now;
        updateData.completionDate = data.completionDate ? new Date(data.completionDate) : now;
        updateData.completedAt = now;
      } else if (newStatus === GovernmentStatus.REJECTED) {
        updateData.rejectedAt = now;
        updateData.rejectionReason = data.rejectionReason || data.statusDescription || "Application rejected by authority.";
      } else if (
        newStatus === GovernmentStatus.QUERY_RAISED ||
        newStatus === GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED ||
        newStatus === GovernmentStatus.CORRECTION_REQUIRED
      ) {
        updateData.additionalInformationRequired = true;
        updateData.additionalInformationRequestedAt = now;
        updateData.isSlaPaused = true;
        updateData.slaPauseReason = "Awaiting Client Information / Government Query Resolution";
      }

      // Update Government Record
      const updatedGovApp = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: updateData,
      });

      // Record Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: oldStatus,
          toStatus: newStatus,
          statusDescription: updateData.statusDescription,
          notes: data.notes,
          changedById: adminId,
          source: data.source || "ADMIN",
          externalReference: data.externalReference || govApp.externalReference,
        },
      });

      // Attach Evidence if provided
      if (data.evidenceDocumentUrl) {
        await tx.governmentEvidence.create({
          data: {
            governmentApplicationId: governmentRecordId,
            documentName: `Status Evidence (${newStatus}) - ${data.externalReference || govApp.externalReference}`,
            documentType: newStatus === GovernmentStatus.APPROVED ? "APPROVAL_LETTER" : "STATUS_PROOF",
            fileUrl: data.evidenceDocumentUrl,
            uploadedById: adminId,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      // Sync Host Application Status
      let hostAppTargetStatus: ApplicationStatus | null = null;

      if (newStatus === GovernmentStatus.APPROVED || newStatus === GovernmentStatus.CERTIFICATE_READY) {
        hostAppTargetStatus = ApplicationStatus.DOCUMENT_RECEIVED;
      } else if (newStatus === GovernmentStatus.READY_FOR_COLLECTION) {
        hostAppTargetStatus = ApplicationStatus.DOCUMENT_RECEIVED;
      } else if (newStatus === GovernmentStatus.REJECTED) {
        hostAppTargetStatus = ApplicationStatus.ON_HOLD;
      }

      if (hostAppTargetStatus) {
        await tx.application.update({
          where: { id: govApp.applicationId },
          data: { status: hostAppTargetStatus, updatedAt: now },
        });
      }

      // Log SLA Timing Event
      await tx.applicationSlaEvent.create({
        data: {
          applicationId: govApp.applicationId,
          eventType: SlaEventType.STATUS_CHANGE,
          category: SlaEventCategory.GOVERNMENT_WAITING,
          reason: `Government status updated: ${oldStatus} -> ${newStatus}`,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          metadata: {
            governmentApplicationId: governmentRecordId,
            fromStatus: oldStatus,
            toStatus: newStatus,
          },
        },
      });

      return updatedGovApp;
    });

    // Record Audit Log
    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_STATUS_CHANGED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: { fromStatus: oldStatus, toStatus: newStatus, notes: data.notes },
    });

    // Notify Client on major transitions
    const notifyCtx: BaseNotificationContext = {
      organizationId,
      applicationId: govApp.application.id,
      applicationNumber: govApp.application.applicationNumber,
      serviceName: govApp.application.service.name,
      clientUserId: govApp.application.clientId,
      clientName: govApp.application.client.fullName,
      clientEmail: govApp.application.client.email,
      clientPhone: govApp.application.client.phone || "",
    };

    if (newStatus === GovernmentStatus.APPROVED || newStatus === GovernmentStatus.REJECTED || newStatus === GovernmentStatus.CERTIFICATE_READY) {
      await notificationOrchestrator.notifyGovernmentUpdate(notifyCtx, {
        agency: govApp.governmentAgency,
        externalReference: govApp.externalReference || "",
        status: newStatus,
        statusDescription: result.statusDescription || "",
      });
    }

    return result;
  }

  /**
   * Record Government Query / Deficiency & Auto-generate Client Action
   */
  async recordQuery(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      queryType: GovernmentQueryType;
      severity: GovernmentQuerySeverity;
      referenceNumber?: string;
      receivedAt?: Date;
      responseDeadline?: Date;
      description: string;
      internalNotes?: string;
      createClientAction?: boolean;
      clientActionType?: ClientActionType;
      clientActionTitle?: string;
      clientActionDescription?: string;
      requirementId?: string;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: { application: { include: { client: true, service: true } } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const now = new Date();
    const deadline = data.responseDeadline ? new Date(data.responseDeadline) : new Date(now.getTime() + 5 * 86400000);

    const result = await prisma.$transaction(async (tx) => {
      let clientActionId: string | undefined = undefined;

      // 1. Auto-create Client Action if requested
      if (data.createClientAction !== false) {
        const clientAction = await tx.clientAction.create({
          data: {
            organizationId,
            applicationId: govApp.applicationId,
            requirementId: data.requirementId || null,
            type: data.clientActionType || ClientActionType.PROVIDE_INFORMATION,
            title: data.clientActionTitle || `Government Query: ${data.description.substring(0, 60)}`,
            description: data.clientActionDescription || data.description,
            priority: data.severity === "CRITICAL" || data.severity === "HIGH" ? ApplicationPriority.HIGH : ApplicationPriority.NORMAL,
            dueAt: deadline,
            status: ClientActionStatus.OPEN,
            createdById: adminId,
          },
        });
        clientActionId = clientAction.id;
      }

      // 2. Create Government Query Record
      const query = await tx.governmentQuery.create({
        data: {
          governmentApplicationId: governmentRecordId,
          queryType: data.queryType || GovernmentQueryType.OTHER,
          severity: data.severity || GovernmentQuerySeverity.MEDIUM,
          referenceNumber: data.referenceNumber,
          receivedAt: data.receivedAt ? new Date(data.receivedAt) : now,
          responseDeadline: deadline,
          description: data.description,
          internalNotes: data.internalNotes,
          clientActionId,
          createdById: adminId,
        },
      });

      // 3. Update Government Status
      await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: GovernmentStatus.QUERY_RAISED,
          statusDescription: `Government Query Raised (${data.queryType}): ${data.description}`,
          additionalInformationRequired: true,
          additionalInformationRequestedAt: now,
          additionalInformationDeadline: deadline,
          isSlaPaused: true,
          slaPauseReason: `Authority Query Raised - Awaiting Client Response (${data.queryType})`,
        },
      });

      // 4. Record Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: GovernmentStatus.QUERY_RAISED,
          statusDescription: `Official Query Received: ${data.description}`,
          notes: data.internalNotes,
          changedById: adminId,
          source: "GOVERNMENT_QUERY",
          externalReference: data.referenceNumber || govApp.externalReference,
        },
      });

      return query;
    });

    // Audit Log
    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_QUERY_RECORDED",
      resource: "GovernmentQuery",
      resourceId: result.id,
      metadata: {
        governmentApplicationId: governmentRecordId,
        queryType: data.queryType,
        severity: data.severity,
        clientActionId: result.clientActionId,
      },
    });

    // Notify Client
    const notifyCtx: BaseNotificationContext = {
      organizationId,
      applicationId: govApp.application.id,
      applicationNumber: govApp.application.applicationNumber,
      serviceName: govApp.application.service.name,
      clientUserId: govApp.application.clientId,
      clientName: govApp.application.client.fullName,
      clientEmail: govApp.application.client.email,
      clientPhone: govApp.application.client.phone || "",
    };

    await notificationOrchestrator.notifyClientActionRequired(notifyCtx, {
      actionTitle: `Government Query: ${govApp.governmentAgency}`,
      actionDescription: data.description,
      deadline,
    });

    return result;
  }

  /**
   * Record Government Statutory Fee Payment
   */
  async recordPayment(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      amount: number;
      currency?: string;
      paymentMethod?: any;
      paymentReference?: string;
      paymentDate?: Date;
      receiptNumber?: string;
      receiptDocumentUrl?: string;
      status?: GovernmentPaymentStatus;
      notes?: string;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const now = new Date();
    const paymentStatus = data.status || GovernmentPaymentStatus.PAID;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment Entry
      const payment = await tx.governmentPayment.create({
        data: {
          governmentApplicationId: governmentRecordId,
          amount: data.amount,
          currency: data.currency || "KES",
          paymentMethod: data.paymentMethod || "MPESA",
          paymentReference: data.paymentReference,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : now,
          receiptNumber: data.receiptNumber,
          paidById: adminId,
          receiptDocumentUrl: data.receiptDocumentUrl,
          status: paymentStatus,
          notes: data.notes,
        },
      });

      // 2. Attach Receipt Evidence if URL provided
      if (data.receiptDocumentUrl) {
        await tx.governmentEvidence.create({
          data: {
            governmentApplicationId: governmentRecordId,
            documentName: `Statutory Payment Receipt - ${data.receiptNumber || data.paymentReference || "KES " + data.amount}`,
            documentType: "PAYMENT_RECEIPT",
            fileUrl: data.receiptDocumentUrl,
            uploadedById: adminId,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      // 3. Update Government Record Statutory Payment Status
      await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          statutoryPaymentStatus: paymentStatus,
          statutoryFeeAmount: data.amount,
          receiptNumber: data.receiptNumber || govApp.receiptNumber,
        },
      });

      // 4. Record Status History Note
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: govApp.status,
          statusDescription: `Statutory fee payment recorded (${data.currency || "KES"} ${data.amount} - Ref: ${data.paymentReference || "N/A"})`,
          notes: data.notes,
          changedById: adminId,
          source: "PAYMENT",
          externalReference: data.paymentReference || govApp.externalReference,
        },
      });

      return payment;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_PAYMENT_RECORDED",
      resource: "GovernmentPayment",
      resourceId: result.id,
      metadata: {
        governmentApplicationId: governmentRecordId,
        amount: data.amount,
        reference: data.paymentReference,
      },
    });

    return result;
  }

  /**
   * Schedule Government Appointment / Biometrics / Interview
   */
  async scheduleAppointment(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      appointmentType: GovernmentAppointmentType;
      authorityName: string;
      scheduledAt: Date;
      location?: string;
      referenceNumber?: string;
      officerContact?: string;
      clientInstructions?: string;
      requiredDocuments?: string[];
      isClientVisible?: boolean;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: { application: { include: { client: true, service: true } } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const appointmentDate = new Date(data.scheduledAt);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Appointment Record
      const appointment = await tx.governmentAppointment.create({
        data: {
          governmentApplicationId: governmentRecordId,
          appointmentType: data.appointmentType || GovernmentAppointmentType.GOVERNMENT_OFFICE_VISIT,
          authorityName: data.authorityName,
          scheduledAt: appointmentDate,
          location: data.location,
          referenceNumber: data.referenceNumber,
          officerContact: data.officerContact,
          status: GovernmentAppointmentStatus.SCHEDULED,
          clientInstructions: data.clientInstructions,
          requiredDocuments: data.requiredDocuments || [],
          isClientVisible: data.isClientVisible !== false,
          createdById: adminId,
        },
      });

      // 2. Update Government Application Status
      let newGovStatus: GovernmentStatus = GovernmentStatus.APPOINTMENT_REQUIRED;
      if (data.appointmentType === GovernmentAppointmentType.BIOMETRICS) {
        newGovStatus = GovernmentStatus.BIOMETRICS_REQUIRED;
      } else if (data.appointmentType === GovernmentAppointmentType.VISA_INTERVIEW) {
        newGovStatus = GovernmentStatus.INTERVIEW_REQUIRED;
      }

      await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: newGovStatus,
          statusDescription: `Appointment Scheduled (${data.appointmentType}) on ${appointmentDate.toLocaleString()}`,
          isSlaPaused: true,
          slaPauseReason: `Appointment Scheduled - Awaiting Client Attendance (${data.appointmentType})`,
        },
      });

      // 3. Status History
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: newGovStatus,
          statusDescription: `Appointment scheduled at ${data.authorityName} for ${appointmentDate.toLocaleString()}`,
          notes: data.clientInstructions,
          changedById: adminId,
          source: "APPOINTMENT",
        },
      });

      return appointment;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_APPOINTMENT_SCHEDULED",
      resource: "GovernmentAppointment",
      resourceId: result.id,
      metadata: {
        governmentApplicationId: governmentRecordId,
        appointmentType: data.appointmentType,
        scheduledAt: appointmentDate,
      },
    });

    // Notify Client if Client Visible
    if (data.isClientVisible !== false) {
      const notifyCtx: BaseNotificationContext = {
        organizationId,
        applicationId: govApp.application.id,
        applicationNumber: govApp.application.applicationNumber,
        serviceName: govApp.application.service.name,
        clientUserId: govApp.application.clientId,
        clientName: govApp.application.client.fullName,
        clientEmail: govApp.application.client.email,
        clientPhone: govApp.application.client.phone || "",
      };

      await notificationOrchestrator.notifyClientActionRequired(notifyCtx, {
        actionTitle: `Appointment Scheduled: ${data.authorityName}`,
        actionDescription: `Scheduled for ${appointmentDate.toLocaleString()} at ${data.location || "Government Registry"}. Instructions: ${data.clientInstructions || "Please arrive 15 minutes prior."}`,
        deadline: appointmentDate,
      });
    }

    return result;
  }

  /**
   * Record Registry Follow-up / Chasing Attempt
   */
  async recordFollowUp(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      attemptedAt?: Date;
      method?: GovernmentFollowUpMethod;
      contactPerson?: string;
      officeContacted?: string;
      outcome?: string;
      notes?: string;
      nextFollowUpDate?: Date;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const now = new Date();
    const nextDate = data.nextFollowUpDate
      ? new Date(data.nextFollowUpDate)
      : new Date(now.getTime() + govApp.followUpFrequencyDays * 86400000);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Follow-up Entry
      const followUp = await tx.governmentFollowUp.create({
        data: {
          governmentApplicationId: governmentRecordId,
          attemptedAt: data.attemptedAt ? new Date(data.attemptedAt) : now,
          method: data.method || GovernmentFollowUpMethod.PHONE_CALL,
          contactPerson: data.contactPerson,
          officeContacted: data.officeContacted || govApp.governmentAgency,
          outcome: data.outcome,
          notes: data.notes,
          nextFollowUpDate: nextDate,
          performedById: adminId,
        },
      });

      // 2. Update Government Application Record
      await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          lastFollowUpDate: now,
          nextFollowUpDate: nextDate,
        },
      });

      // 3. Status History Entry
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: govApp.status,
          statusDescription: `Follow-up attempt (${data.method || "PHONE"}): ${data.outcome || "Followed up with registry"}`,
          notes: data.notes,
          changedById: adminId,
          source: "FOLLOW_UP",
        },
      });

      return followUp;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_FOLLOWUP_RECORDED",
      resource: "GovernmentFollowUp",
      resourceId: result.id,
      metadata: {
        governmentApplicationId: governmentRecordId,
        method: data.method,
        outcome: data.outcome,
        nextFollowUpDate: nextDate,
      },
    });

    return result;
  }

  /**
   * Record External Update from Registry Portal / Email / Official Letter
   */
  async recordExternalUpdate(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      status?: GovernmentStatus;
      source?: GovernmentFollowUpMethod;
      receivedAt?: Date;
      referenceNumber?: string;
      summary: string;
      fullNotes?: string;
      governmentOfficer?: string;
      nextRequiredAction?: string;
      nextFollowUpDate?: Date;
      evidenceUrl?: string;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const now = new Date();
    const targetStatus = data.status || govApp.status;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Government Record
      const updated = await tx.governmentApplication.update({
        where: { id: governmentRecordId },
        data: {
          status: targetStatus,
          statusDescription: data.summary,
          lastCheckedAt: now,
          officerContact: data.governmentOfficer || govApp.officerContact,
          externalReference: data.referenceNumber || govApp.externalReference,
          nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : govApp.nextFollowUpDate,
        },
      });

      // 2. Record Status History Entry
      await tx.governmentStatusHistory.create({
        data: {
          governmentApplicationId: governmentRecordId,
          fromStatus: govApp.status,
          toStatus: targetStatus,
          statusDescription: `External Update (${data.source || "PORTAL"}): ${data.summary}`,
          notes: data.fullNotes ? `${data.fullNotes}\nNext action: ${data.nextRequiredAction || "N/A"}` : data.summary,
          changedById: adminId,
          source: "EXTERNAL_UPDATE",
          externalReference: data.referenceNumber || govApp.externalReference,
        },
      });

      // 3. Attach Evidence if provided
      if (data.evidenceUrl) {
        await tx.governmentEvidence.create({
          data: {
            governmentApplicationId: governmentRecordId,
            documentName: `External Update Attachment - ${data.summary.substring(0, 40)}`,
            documentType: "EXTERNAL_UPDATE",
            fileUrl: data.evidenceUrl,
            uploadedById: adminId,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      return updated;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_EXTERNAL_UPDATE_RECORDED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: { summary: data.summary, source: data.source, targetStatus },
    });

    return result;
  }

  /**
   * Upload Evidence / Document to Government Submission Dossier
   */
  async uploadEvidence(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      documentName: string;
      documentType: string;
      fileUrl: string;
      visibility?: NoteVisibility;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const evidence = await prisma.governmentEvidence.create({
      data: {
        governmentApplicationId: governmentRecordId,
        documentName: data.documentName,
        documentType: data.documentType,
        fileUrl: data.fileUrl,
        uploadedById: adminId,
        visibility: data.visibility || NoteVisibility.CLIENT_VISIBLE,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_EVIDENCE_UPLOADED",
      resource: "GovernmentEvidence",
      resourceId: evidence.id,
      metadata: {
        governmentApplicationId: governmentRecordId,
        documentName: data.documentName,
        documentType: data.documentType,
      },
    });

    return evidence;
  }

  /**
   * Assign Government Case Officers & Team
   */
  async assignGovernmentCase(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      primaryOfficerId?: string | null;
      secondaryOfficerId?: string | null;
      supervisorId?: string | null;
      team?: string | null;
    }
  ) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    const updated = await prisma.governmentApplication.update({
      where: { id: governmentRecordId },
      data: {
        primaryOfficerId: data.primaryOfficerId === null ? null : data.primaryOfficerId || govApp.primaryOfficerId,
        secondaryOfficerId: data.secondaryOfficerId === null ? null : data.secondaryOfficerId || govApp.secondaryOfficerId,
        supervisorId: data.supervisorId === null ? null : data.supervisorId || govApp.supervisorId,
        team: data.team === null ? null : data.team || govApp.team,
        followUpOwnerId: data.primaryOfficerId || govApp.followUpOwnerId,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "GOVERNMENT_CASE_ASSIGNED",
      resource: "GovernmentApplication",
      resourceId: governmentRecordId,
      metadata: data,
    });

    return updated;
  }

  /**
   * Admin: Government Work Queue with Multi-Facet Filters, Search & Pagination
   */
  async getGovernmentQueue(organizationId: string, filters: GovernmentQueueFilter) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      application: { organizationId, deletedAt: null },
    };

    // Text Search
    if (filters.search) {
      where.OR = [
        { externalReference: { contains: filters.search, mode: "insensitive" } },
        { trackingNumber: { contains: filters.search, mode: "insensitive" } },
        { receiptNumber: { contains: filters.search, mode: "insensitive" } },
        { governmentAgency: { contains: filters.search, mode: "insensitive" } },
        { platform: { contains: filters.search, mode: "insensitive" } },
        { application: { applicationNumber: { contains: filters.search, mode: "insensitive" } } },
        { application: { client: { fullName: { contains: filters.search, mode: "insensitive" } } } },
        { application: { client: { email: { contains: filters.search, mode: "insensitive" } } } },
      ];
    }

    // Specific Filters
    if (filters.agency) {
      where.governmentAgency = { equals: filters.agency, mode: "insensitive" };
    }
    if (filters.platform) {
      where.platform = { equals: filters.platform, mode: "insensitive" };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.channel) {
      where.submissionChannel = filters.channel;
    }
    if (filters.officerId) {
      where.OR = [
        { primaryOfficerId: filters.officerId },
        { secondaryOfficerId: filters.officerId },
        { submittedByAdminId: filters.officerId },
      ];
    }
    if (filters.paymentStatus) {
      where.statutoryPaymentStatus = filters.paymentStatus;
    }

    // Tab Views / Quick Filters
    if (filters.tabView) {
      switch (filters.tabView) {
        case "READY_FOR_SUBMISSION":
          where.status = { in: [GovernmentStatus.READY_TO_SUBMIT, GovernmentStatus.PREPARING, GovernmentStatus.NOT_STARTED] };
          break;
        case "AWAITING_RESPONSE":
          where.status = {
            in: [
              GovernmentStatus.SUBMITTED,
              GovernmentStatus.SUBMISSION_IN_PROGRESS,
              GovernmentStatus.UNDER_PROCESSING,
              GovernmentStatus.ACKNOWLEDGED,
            ],
          };
          break;
        case "GOVERNMENT_QUERIES":
          where.status = {
            in: [
              GovernmentStatus.QUERY_RAISED,
              GovernmentStatus.ADDITIONAL_INFORMATION_REQUIRED,
              GovernmentStatus.CORRECTION_REQUIRED,
            ],
          };
          break;
        case "PAYMENT_REQUIRED":
          where.OR = [
            { status: { in: [GovernmentStatus.PAYMENT_REQUIRED, GovernmentStatus.PAYMENT_PENDING] } },
            { statutoryPaymentStatus: { in: [GovernmentPaymentStatus.REQUIRED, GovernmentPaymentStatus.AWAITING_PAYMENT] } },
          ];
          break;
        case "APPOINTMENTS":
          where.OR = [
            {
              status: {
                in: [
                  GovernmentStatus.APPOINTMENT_REQUIRED,
                  GovernmentStatus.BIOMETRICS_REQUIRED,
                  GovernmentStatus.INTERVIEW_REQUIRED,
                ],
              },
            },
            { appointments: { some: { status: GovernmentAppointmentStatus.SCHEDULED } } },
          ];
          break;
        case "APPROVED":
          where.status = {
            in: [
              GovernmentStatus.APPROVED,
              GovernmentStatus.CERTIFICATE_READY,
              GovernmentStatus.READY_FOR_COLLECTION,
            ],
          };
          break;
        case "OVERDUE_FOLLOWUPS":
          where.nextFollowUpDate = { lte: new Date() };
          where.status = {
            notIn: [
              GovernmentStatus.APPROVED,
              GovernmentStatus.COLLECTED,
              GovernmentStatus.CLOSED,
              GovernmentStatus.REJECTED,
              GovernmentStatus.WITHDRAWN,
              GovernmentStatus.CANCELLED,
            ],
          };
          break;
        case "CLOSED":
          where.status = { in: [GovernmentStatus.CLOSED, GovernmentStatus.COLLECTED, GovernmentStatus.WITHDRAWN, GovernmentStatus.CANCELLED] };
          break;
        default:
          break;
      }
    }

    if (filters.followUpDue === true) {
      where.nextFollowUpDate = { lte: new Date() };
    }
    if (filters.overdue === true) {
      where.expectedResponseDate = { lte: new Date() };
      where.status = {
        notIn: [
          GovernmentStatus.APPROVED,
          GovernmentStatus.COLLECTED,
          GovernmentStatus.CLOSED,
          GovernmentStatus.REJECTED,
          GovernmentStatus.WITHDRAWN,
          GovernmentStatus.CANCELLED,
        ],
      };
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
              service: { select: { id: true, name: true, code: true, category: true } },
            },
          },
          primaryOfficer: { select: { id: true, firstName: true, lastName: true, email: true } },
          secondaryOfficer: { select: { id: true, firstName: true, lastName: true, email: true } },
          supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
          submittedByAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
          references: true,
          queries: { orderBy: { createdAt: "desc" }, take: 1 },
          appointments: { orderBy: { scheduledAt: "asc" }, take: 1 },
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: {
            select: {
              queries: true,
              appointments: true,
              payments: true,
              evidenceDocs: true,
              followUps: true,
            },
          },
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
   * Get 360° Dossier View of a Government Submission Record
   */
  async getSubmissionDossier(governmentRecordId: string, organizationId: string) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
      include: {
        application: {
          include: {
            client: { select: { id: true, fullName: true, email: true, phone: true, clientType: true } },
            service: true,
            assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
            clientActions: { orderBy: { createdAt: "desc" } },
          },
        },
        primaryOfficer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        secondaryOfficer: { select: { id: true, firstName: true, lastName: true, email: true } },
        supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
        submittedByAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
        followUpOwner: { select: { id: true, firstName: true, lastName: true, email: true } },
        statusHistory: {
          orderBy: { createdAt: "desc" },
        },
        references: {
          orderBy: { createdAt: "desc" },
        },
        queries: {
          orderBy: { createdAt: "desc" },
          include: {
            clientAction: true,
            resolvedBy: { select: { id: true, firstName: true, lastName: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        appointments: {
          orderBy: { scheduledAt: "asc" },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            paidBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        evidenceDocs: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        followUps: {
          orderBy: { attemptedAt: "desc" },
          include: {
            performedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!govApp) throw new NotFoundError("Government application dossier");

    const readinessReport = await applicationReadinessService.evaluateReadiness(
      govApp.applicationId,
      organizationId
    );

    return {
      govApp,
      readinessReport,
    };
  }

  /**
   * Supplementary Methods for Backward Compatibility
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

    return prisma.governmentReference.create({
      data: {
        governmentApplicationId: governmentRecordId,
        referenceType: data.referenceType,
        referenceValue: data.referenceValue,
        issuingPlatform: data.issuingPlatform || govApp.platform,
        metadata: data.metadata || undefined,
      },
    });
  }

  async removeReference(governmentRecordId: string, referenceId: string, organizationId: string, adminId: string) {
    const govApp = await prisma.governmentApplication.findFirst({
      where: { id: governmentRecordId, application: { organizationId } },
    });

    if (!govApp) throw new NotFoundError("Government application record");

    await prisma.governmentReference.delete({
      where: { id: referenceId },
    });

    return { success: true };
  }

  async scheduleFollowUp(
    governmentRecordId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    nextFollowUpDate: Date,
    notes?: string
  ) {
    return this.recordFollowUp(governmentRecordId, organizationId, adminId, adminEmail, {
      nextFollowUpDate,
      notes,
    });
  }

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
            submissionChannel: true,
            externalReference: true,
            trackingNumber: true,
            status: true,
            statusDescription: true,
            lastCheckedAt: true,
            expectedResponseDate: true,
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
            queries: {
              where: { isResolved: false },
              select: { queryType: true, description: true, responseDeadline: true },
            },
            appointments: {
              where: { isClientVisible: true },
              select: { appointmentType: true, authorityName: true, scheduledAt: true, location: true, clientInstructions: true },
            },
            evidenceDocs: {
              where: { visibility: NoteVisibility.CLIENT_VISIBLE },
              select: { documentName: true, documentType: true, fileUrl: true, uploadedAt: true },
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
