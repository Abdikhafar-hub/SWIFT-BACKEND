import { prisma } from "../../infrastructure/database/prisma.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { DeliveryMethod, ApplicationStatus, SlaStatus, NoteVisibility, UserRole } from "@prisma/client";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export interface CreateDeliveryInput {
  deliveryMethod: DeliveryMethod;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  digitalDocumentId?: string;
  physicalAddress?: string;
  dispatchReference?: string;
  carrier?: string;
  trackingNumber?: string;
  proofDocumentUrl?: string;
  notes?: string;
}

export class DeliveryService {
  async dispatchDelivery(
    applicationId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: CreateDeliveryInput
  ) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
      },
    });

    if (!app) throw new NotFoundError("Application");

    let secureDownloadUrl: string | undefined;

    // Generate secure download link for digital deliverables
    if ((data.deliveryMethod === DeliveryMethod.DIGITAL || data.deliveryMethod === DeliveryMethod.BOTH) && data.digitalDocumentId) {
      const doc = await prisma.document.findFirst({
        where: { id: data.digitalDocumentId, applicationId, deletedAt: null },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      });

      if (doc && doc.versions.length > 0) {
        secureDownloadUrl = await storageService.generateSecureUrl(doc.versions[0].storageKey, 86400); // 24 hours
      }
    }

    const now = new Date();

    const deliveryRecord = await prisma.$transaction(async (tx) => {
      const delivery = await tx.applicationDelivery.create({
        data: {
          organizationId,
          applicationId,
          deliveryMethod: data.deliveryMethod,
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientEmail: data.recipientEmail || null,
          physicalAddress: data.physicalAddress || null,
          dispatchReference: data.dispatchReference || `DISP-${Date.now()}`,
          carrier: data.carrier || null,
          trackingNumber: data.trackingNumber || null,
          proofDocumentUrl: data.proofDocumentUrl || null,
          notes: data.notes || null,
          deliveredById: adminId,
          deliveredAt: now,
          confirmationStatus: data.deliveryMethod === DeliveryMethod.DIGITAL ? "CONFIRMED" : "DISPATCHED",
        },
      });

      // Update Application status to DELIVERED
      await tx.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.DELIVERED,
          deliveredAt: now,
          completedAt: now,
          slaStatus: SlaStatus.COMPLETED,
        },
      });

      // Activity log
      await tx.applicationActivity.create({
        data: {
          applicationId,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "APPLICATION_DELIVERED",
          entityType: "ApplicationDelivery",
          entityId: delivery.id,
          fromStatus: app.status,
          toStatus: ApplicationStatus.DELIVERED,
          message: `Official delivery prepared via ${data.deliveryMethod}${data.trackingNumber ? ` (Tracking: ${data.trackingNumber})` : ""}`,
          visibility: NoteVisibility.CLIENT_VISIBLE,
        },
      });

      return delivery;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "APPLICATION_DELIVERY_DISPATCHED",
      resource: "ApplicationDelivery",
      resourceId: deliveryRecord.id,
      metadata: {
        method: data.deliveryMethod,
        recipient: data.recipientName,
        trackingNumber: data.trackingNumber,
      },
    });

    // Notify Client
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

      void notificationOrchestrator.notifyDeliveryReady(ctx, {
        deliveryMethod: data.deliveryMethod,
        secureDownloadUrl,
        dispatchRef: data.trackingNumber,
      });
    }

    return deliveryRecord;
  }

  async confirmDelivery(
    deliveryId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    params: { receivedBy?: string; notes?: string }
  ) {
    const delivery = await prisma.applicationDelivery.findFirst({
      where: { id: deliveryId, organizationId },
    });

    if (!delivery) throw new NotFoundError("Delivery record");

    const updated = await prisma.applicationDelivery.update({
      where: { id: deliveryId },
      data: {
        confirmationStatus: "CONFIRMED",
        deliveredAt: new Date(),
        notes: params.notes ? `${delivery.notes ? delivery.notes + "\n" : ""}${params.notes}` : delivery.notes,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "DELIVERY_CONFIRMED",
      resource: "ApplicationDelivery",
      resourceId: deliveryId,
      metadata: { receivedBy: params.receivedBy },
    });

    return updated;
  }

  async getDeliveries(applicationId: string, organizationId: string, clientId?: string) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, clientId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    return prisma.applicationDelivery.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const deliveryService = new DeliveryService();
