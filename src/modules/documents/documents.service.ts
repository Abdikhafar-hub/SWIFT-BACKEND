import { prisma } from "../../infrastructure/database/prisma.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import {
  DocumentStatus,
  RequirementStatus,
  UserRole,
  NoteVisibility,
  ApplicationPriority,
  ClientActionType,
  ClientActionStatus,
  ApplicationStatus,
  SlaEventType,
  SlaEventCategory,
} from "@prisma/client";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export class DocumentService {
  async uploadDocument(
    params: {
      organizationId: string;
      clientId: string;
      applicationId?: string | null;
      applicationRequirementId?: string | null;
      documentType: string;
      title: string;
      fileName: string;
      mimeType: string;
      base64Data: string;
      expiresAt?: Date | null;
      documentNumber?: string | null;
      issuingAuthority?: string | null;
      issuedAt?: Date | null;
    },
    actor: { id: string; email: string; role: UserRole }
  ) {
    // 1. Decode base64 to buffer
    const buffer = Buffer.from(params.base64Data, "base64");
    if (buffer.length === 0) {
      throw new ValidationError("Uploaded file is empty");
    }

    // 2. Upload to storage provider
    const uploadedFile = await storageService.upload({
      buffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
      folder: `clients/${params.clientId}/applications/${params.applicationId || "general"}`,
    });

    // 3. Check if document already exists for this requirement/type (versioning)
    const existingDoc = await prisma.document.findFirst({
      where: {
        organizationId: params.organizationId,
        clientId: params.clientId,
        applicationId: params.applicationId || undefined,
        applicationRequirementId: params.applicationRequirementId || undefined,
        documentType: params.documentType,
        deletedAt: null,
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    return prisma.$transaction(async (tx) => {
      let docId: string;
      let nextVersionNumber = 1;

      if (existingDoc) {
        docId = existingDoc.id;
        const currentVersion = existingDoc.versions[0]?.versionNumber || 1;
        nextVersionNumber = currentVersion + 1;

        await tx.document.update({
          where: { id: docId },
          data: {
            title: params.title,
            status: DocumentStatus.PENDING_REVIEW,
            expiresAt: params.expiresAt !== undefined ? params.expiresAt : existingDoc.expiresAt,
            documentNumber: params.documentNumber !== undefined ? params.documentNumber : existingDoc.documentNumber,
            issuingAuthority: params.issuingAuthority !== undefined ? params.issuingAuthority : existingDoc.issuingAuthority,
            issuedAt: params.issuedAt !== undefined ? params.issuedAt : existingDoc.issuedAt,
            isExpired: false,
          },
        });
      } else {
        const createdDoc = await tx.document.create({
          data: {
            organizationId: params.organizationId,
            clientId: params.clientId,
            applicationId: params.applicationId || null,
            applicationRequirementId: params.applicationRequirementId || null,
            documentType: params.documentType,
            title: params.title,
            status: DocumentStatus.PENDING_REVIEW,
            expiresAt: params.expiresAt || null,
            documentNumber: params.documentNumber || null,
            issuingAuthority: params.issuingAuthority || null,
            issuedAt: params.issuedAt || null,
            isExpired: false,
          },
        });
        docId = createdDoc.id;
      }

      // Create Document Version
      const version = await tx.documentVersion.create({
        data: {
          documentId: docId,
          versionNumber: nextVersionNumber,
          storageProvider: "CLOUDINARY",
          storageKey: uploadedFile.storageKey,
          secureUrl: uploadedFile.secureUrl,
          fileName: params.fileName,
          fileSize: uploadedFile.fileSize,
          mimeType: uploadedFile.mimeType,
          fileExtension: uploadedFile.fileExtension,
          uploadedById: actor.id,
        },
      });

      // Update current version pointer on Document
      await tx.document.update({
        where: { id: docId },
        data: { currentVersionId: version.id },
      });

      // If tied to application requirement, mark requirement submitted & satisfied
      if (params.applicationRequirementId) {
        await tx.applicationRequirement.update({
          where: { id: params.applicationRequirementId },
          data: {
            isSatisfied: true,
            status: RequirementStatus.SUBMITTED,
            submittedAt: new Date(),
            satisfiedAt: new Date(),
            satisfiedById: actor.id,
          },
        });

        await tx.requirementReviewHistory.create({
          data: {
            applicationRequirementId: params.applicationRequirementId,
            actorId: actor.id,
            actorRole: actor.role,
            action: nextVersionNumber > 1 ? "UPDATE" : "SUBMIT",
            status: RequirementStatus.SUBMITTED,
            newValue: {
              documentId: docId,
              versionNumber: nextVersionNumber,
              fileName: params.fileName,
            },
            notes: `Document uploaded: ${params.fileName} (v${nextVersionNumber})`,
          },
        });
      }

      // Log Activity if application linked
      if (params.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: params.applicationId,
            actorId: actor.id,
            actorRole: actor.role,
            action: "DOCUMENT_UPLOADED",
            entityType: "Document",
            entityId: docId,
            message: `Document '${params.title}' uploaded (Version ${nextVersionNumber})`,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      await recordAuditLog(
        {
          organizationId: params.organizationId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "DOCUMENT_UPLOADED",
          resource: "Document",
          resourceId: docId,
          metadata: {
            versionNumber: nextVersionNumber,
            fileName: params.fileName,
            fileSize: uploadedFile.fileSize,
          },
        },
        tx
      );

      return tx.document.findUnique({
        where: { id: docId },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
          },
        },
      });
    });
  }

  async reviewDocument(
    documentId: string,
    organizationId: string,
    status: DocumentStatus,
    reviewNotes: string | undefined,
    requestReplacement: boolean = true,
    replacementDeadline: Date | undefined,
    adminActor: { id: string; email: string }
  ) {
    if (status === DocumentStatus.REJECTED && !reviewNotes) {
      throw new BadRequestError("Rejection reason / review notes are mandatory when rejecting a document.");
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        application: { include: { service: true } },
        applicationRequirement: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });

    if (!document) throw new NotFoundError("Document");

    const latestVersion = document.versions[0];
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Update document status
      const updatedDoc = await tx.document.update({
        where: { id: documentId },
        data: { status },
      });

      // Update version review status
      if (latestVersion) {
        await tx.documentVersion.update({
          where: { id: latestVersion.id },
          data: {
            reviewedById: adminActor.id,
            reviewedAt: now,
            reviewNotes,
          },
        });
      }

      // If attached to application requirement, synchronize requirement status
      if (document.applicationRequirementId) {
        const reqStatus =
          status === DocumentStatus.APPROVED
            ? RequirementStatus.APPROVED
            : status === DocumentStatus.REJECTED
            ? RequirementStatus.REJECTED
            : RequirementStatus.UNDER_REVIEW;

        await tx.applicationRequirement.update({
          where: { id: document.applicationRequirementId },
          data: {
            status: reqStatus,
            isSatisfied: status === DocumentStatus.APPROVED,
            rejectionReason: status === DocumentStatus.REJECTED ? reviewNotes : null,
            reviewedAt: now,
            reviewedById: adminActor.id,
            verifiedAt: status === DocumentStatus.APPROVED ? now : null,
            verifiedById: status === DocumentStatus.APPROVED ? adminActor.id : null,
            notes: reviewNotes || (status === DocumentStatus.APPROVED ? "Verified by document review" : null),
          },
        });

        await tx.requirementReviewHistory.create({
          data: {
            applicationRequirementId: document.applicationRequirementId,
            actorId: adminActor.id,
            actorRole: UserRole.ADMIN,
            action: status === DocumentStatus.APPROVED ? "APPROVE" : "REJECT",
            status: reqStatus,
            reason: status === DocumentStatus.REJECTED ? reviewNotes : null,
            notes: reviewNotes,
          },
        });
      }

      // If rejected and linked to application, generate ClientAction for document replacement
      if (status === DocumentStatus.REJECTED && document.applicationId && requestReplacement) {
        const dueAt = replacementDeadline || new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        const clientAction = await tx.clientAction.create({
          data: {
            organizationId,
            applicationId: document.applicationId,
            requirementId: document.applicationRequirementId || null,
            type: ClientActionType.REPLACE_DOCUMENT,
            title: `Replace Rejected Document: ${document.title}`,
            description: `Document '${document.title}' was rejected by reviewer: ${reviewNotes}. Please upload a clear and compliant replacement copy.`,
            priority: ApplicationPriority.HIGH,
            dueAt,
            status: ClientActionStatus.OPEN,
            createdById: adminActor.id,
          },
        });

        // Set application status to ADDITIONAL_INFORMATION_REQUIRED & pause SLA if configured
        const shouldPauseSla = document.application?.service.pauseSlaOnClientAction !== false;
        await tx.application.update({
          where: { id: document.applicationId },
          data: {
            status: ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
            pausedAt: shouldPauseSla ? now : document.application?.pausedAt,
          },
        });

        if (shouldPauseSla) {
          await tx.applicationSlaEvent.create({
            data: {
              applicationId: document.applicationId,
              eventType: SlaEventType.PAUSED,
              category: SlaEventCategory.CLIENT_WAITING,
              reason: `Document rejected (${document.title}): Awaiting replacement upload`,
              actorId: adminActor.id,
              actorRole: UserRole.ADMIN,
            },
          });
        }
      }

      // Log activity
      if (document.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: document.applicationId,
            actorId: adminActor.id,
            actorRole: UserRole.ADMIN,
            action: status === DocumentStatus.APPROVED ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
            entityType: "Document",
            entityId: documentId,
            message: `Document '${document.title}' was ${status.toLowerCase()}${reviewNotes ? `: ${reviewNotes}` : ""}`,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      await recordAuditLog(
        {
          organizationId,
          actorId: adminActor.id,
          actorEmail: adminActor.email,
          actorRole: UserRole.ADMIN,
          action: `DOCUMENT_${status}`,
          resource: "Document",
          resourceId: documentId,
          metadata: { status, reviewNotes },
        },
        tx
      );

      return updatedDoc;
    });

    // Notify client via Orchestrator
    const client = document.client;
    if (client.user && document.application) {
      const ctx: BaseNotificationContext = {
        organizationId,
        applicationId: document.application.id,
        applicationNumber: document.application.applicationNumber,
        serviceName: document.application.service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };

      if (status === DocumentStatus.REJECTED) {
        void notificationOrchestrator.notifyClientActionRequired(ctx, {
          actionTitle: `Replace Rejected Document: ${document.title}`,
          actionDescription: reviewNotes || "Document rejected. Please upload a clear replacement.",
          deadline: replacementDeadline,
        });
      } else {
        void notificationOrchestrator.notifyRequirementReview(ctx, {
          reqName: document.title,
          status: "APPROVED",
          notes: reviewNotes,
        });
      }
    }

    return result;
  }

  async updateMetadata(
    documentId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      title?: string;
      expiresAt?: Date | null;
      documentNumber?: string | null;
      issuingAuthority?: string | null;
      issuedAt?: Date | null;
      isArchived?: boolean;
    }
  ) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });

    if (!doc) throw new NotFoundError("Document");

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        title: data.title || doc.title,
        expiresAt: data.expiresAt !== undefined ? data.expiresAt : doc.expiresAt,
        documentNumber: data.documentNumber !== undefined ? data.documentNumber : doc.documentNumber,
        issuingAuthority: data.issuingAuthority !== undefined ? data.issuingAuthority : doc.issuingAuthority,
        issuedAt: data.issuedAt !== undefined ? data.issuedAt : doc.issuedAt,
        isArchived: data.isArchived !== undefined ? data.isArchived : doc.isArchived,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "DOCUMENT_METADATA_UPDATED",
      resource: "Document",
      resourceId: documentId,
      metadata: data,
    });

    return updated;
  }

  async checkExpiringDocuments(organizationId?: string) {
    const now = new Date();
    const ninetyDaysAhead = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const where: any = {
      deletedAt: null,
      isArchived: false,
      expiresAt: { not: null, lte: ninetyDaysAhead },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const expiringDocs = await prisma.document.findMany({
      where,
      include: {
        client: { include: { user: true } },
      },
    });

    let expiredCount = 0;
    let alertsSent = 0;

    for (const doc of expiringDocs) {
      if (doc.expiresAt && doc.expiresAt < now && !doc.isExpired) {
        await prisma.document.update({
          where: { id: doc.id },
          data: { isExpired: true },
        });
        expiredCount++;
      }

      if (doc.client.user && doc.expiresAt) {
        await notificationOrchestrator.notifyDocumentExpiry(
          doc.client.user.id,
          doc.organizationId,
          doc.client.fullName,
          doc.client.email,
          doc.client.phone,
          doc.title,
          doc.expiresAt
        );
        alertsSent++;
      }
    }

    return {
      evaluatedCount: expiringDocs.length,
      expiredCount,
      alertsSent,
      timestamp: now,
    };
  }

  async getSecureDownloadUrl(
    documentId: string,
    organizationId: string,
    actor: { id: string; role: UserRole; clientId?: string | null }
  ) {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null,
        clientId: actor.role === UserRole.CLIENT ? actor.clientId || "none" : undefined,
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });

    if (!document || document.versions.length === 0) {
      throw new NotFoundError("Document");
    }

    const latestVersion = document.versions[0];
    const secureUrl = await storageService.generateSecureUrl(latestVersion.storageKey, 3600);

    return {
      documentId: document.id,
      title: document.title,
      fileName: latestVersion.fileName,
      mimeType: latestVersion.mimeType,
      fileSize: latestVersion.fileSize,
      downloadUrl: secureUrl,
      expiresIn: 3600,
    };
  }
}

export const documentService = new DocumentService();
