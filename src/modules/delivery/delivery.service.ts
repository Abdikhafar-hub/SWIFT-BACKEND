import { prisma } from "../../infrastructure/database/prisma.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { DeliveryMethod, ApplicationStatus, SlaStatus, NoteVisibility, UserRole } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";
import { notificationOrchestrator, BaseNotificationContext } from "../notifications/notification-orchestrator.service.js";

export interface CreateDeliveryInput {
  applicationId?: string;
  clientId?: string;
  deliveryType?: string;
  priority?: string;
  deliveryMethod?: DeliveryMethod;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  physicalAddress?: string;
  cityCounty?: string;
  postalCode?: string;
  deliveryInstructions?: string;
  carrier?: string;
  trackingNumber?: string;
  dispatchMethod?: string;
  expectedDeliveryDate?: string;
  dispatchDate?: string;
  documents?: any[];
  specialInstructions?: string;
  internalNotes?: string;
  notes?: string;
  digitalDocumentId?: string;
  proofDocumentUrl?: string;
}

export class DeliveryService {
  /**
   * List all deliveries for organization with search, filtering, and summary metrics
   */
  async listAllDeliveries(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      deliveryType?: string;
      carrier?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const skip = (page - 1) * limit;

    const whereClause: any = { organizationId };

    if (params.status && params.status !== "ALL") {
      whereClause.confirmationStatus = params.status;
    }
    if (params.carrier && params.carrier !== "ALL") {
      whereClause.carrier = params.carrier;
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      whereClause.OR = [
        { dispatchReference: { contains: q, mode: "insensitive" } },
        { trackingNumber: { contains: q, mode: "insensitive" } },
        { recipientName: { contains: q, mode: "insensitive" } },
        { recipientPhone: { contains: q, mode: "insensitive text" } },
        { carrier: { contains: q, mode: "insensitive" } },
        { application: { applicationNumber: { contains: q, mode: "insensitive" } } },
        { application: { client: { fullName: { contains: q, mode: "insensitive" } } } },
        { application: { client: { businessName: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [items, total, allDeliveries] = await Promise.all([
      prisma.applicationDelivery.findMany({
        where: whereClause,
        include: {
          application: {
            include: {
              client: {
                select: {
                  id: true,
                  fullName: true,
                  businessName: true,
                  email: true,
                  phone: true,
                },
              },
              service: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
          deliveredBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.applicationDelivery.count({ where: whereClause }),
      prisma.applicationDelivery.findMany({
        where: { organizationId },
        select: { confirmationStatus: true },
      }),
    ]);

    // Aggregate summary KPIs
    const awaitingDispatchCount = allDeliveries.filter(
      (d) => d.confirmationStatus === "AWAITING_DISPATCH" || d.confirmationStatus === "PENDING"
    ).length;
    const inTransitCount = allDeliveries.filter(
      (d) => d.confirmationStatus === "DISPATCHED" || d.confirmationStatus === "IN_TRANSIT"
    ).length;
    const fulfilledCount = allDeliveries.filter(
      (d) => d.confirmationStatus === "DELIVERED" || d.confirmationStatus === "CONFIRMED"
    ).length;
    const totalDispatched = allDeliveries.length;

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: page < (Math.ceil(total / limit) || 1),
        hasPreviousPage: page > 1,
      },
      summaryMetrics: {
        awaitingDispatchCount,
        inTransitCount,
        fulfilledCount,
        totalDispatched,
      },
    };
  }

  /**
   * Lodge a new delivery record
   */
  async lodgeDelivery(
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: CreateDeliveryInput
  ) {
    let targetAppId = data.applicationId;

    // If no application ID provided, find or pick the latest application for client
    if (!targetAppId && data.clientId) {
      const clientApp = await prisma.application.findFirst({
        where: { clientId: data.clientId, organizationId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (clientApp) {
        targetAppId = clientApp.id;
      }
    }

    if (!targetAppId) {
      // Find any fallback application in organization to attach foreign key constraint
      const fallbackApp = await prisma.application.findFirst({
        where: { organizationId, deletedAt: null },
      });
      if (!fallbackApp) {
        throw new BadRequestError("An active dossier or client application is required to lodge a delivery.");
      }
      targetAppId = fallbackApp.id;
    }

    const app = await prisma.application.findFirst({
      where: { id: targetAppId, organizationId, deletedAt: null },
      include: { client: { include: { user: true } }, service: true },
    });

    if (!app) throw new NotFoundError("Application / Dossier");

    const count = await prisma.applicationDelivery.count({ where: { organizationId } });
    const refNumber = `DLV-${new Date().getFullYear()}-${String(count + 101).padStart(5, "0")}`;

    // Consolidate extra metadata into notes JSON payload
    const structuredNotes = JSON.stringify({
      deliveryType: data.deliveryType || "Client Documents",
      priority: data.priority || "Normal",
      cityCounty: data.cityCounty || "",
      postalCode: data.postalCode || "",
      deliveryInstructions: data.deliveryInstructions || "",
      specialInstructions: data.specialInstructions || "",
      internalNotes: data.internalNotes || "",
      dispatchMethod: data.dispatchMethod || "Courier",
      expectedDeliveryDate: data.expectedDeliveryDate || "",
      dispatchDate: data.dispatchDate || "",
      documents: data.documents || [],
      customNotes: data.notes || "",
      timeline: [
        {
          timestamp: new Date().toISOString(),
          status: "AWAITING_DISPATCH",
          description: "Delivery lodged in command center",
          actor: adminEmail,
        },
      ],
    });

    const deliveryRecord = await prisma.$transaction(async (tx) => {
      const delivery = await tx.applicationDelivery.create({
        data: {
          organizationId,
          applicationId: targetAppId!,
          deliveryMethod: data.deliveryMethod || DeliveryMethod.PHYSICAL,
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientEmail: data.recipientEmail || app.client?.email || null,
          physicalAddress: data.physicalAddress || null,
          dispatchReference: refNumber,
          carrier: data.carrier || "Fargo Courier",
          trackingNumber: data.trackingNumber || `WB-${Math.floor(100000 + Math.random() * 900000)}`,
          notes: structuredNotes,
          deliveredById: adminId,
          confirmationStatus: "AWAITING_DISPATCH",
        },
      });

      // Update associated application status to READY_FOR_DELIVERY
      if (targetAppId) {
        await tx.application.update({
          where: { id: targetAppId },
          data: { status: ApplicationStatus.READY_FOR_DELIVERY },
        });
      }

      // Log application activity
      await tx.applicationActivity.create({
        data: {
          applicationId: targetAppId!,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: "DELIVERY_LODGED",
          entityType: "ApplicationDelivery",
          entityId: delivery.id,
          fromStatus: app.status,
          toStatus: ApplicationStatus.READY_FOR_DELIVERY,
          message: `Delivery ${refNumber} lodged for ${data.recipientName} via ${data.carrier || "Courier"}`,
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
      action: "DELIVERY_LODGED",
      resource: "ApplicationDelivery",
      resourceId: deliveryRecord.id,
      metadata: {
        dispatchReference: refNumber,
        recipient: data.recipientName,
        carrier: data.carrier,
        trackingNumber: deliveryRecord.trackingNumber,
      },
    });

    return deliveryRecord;
  }

  /**
   * Dispatch delivery to courier / physical transport
   */
  async dispatchDeliveryAction(
    deliveryId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    data: {
      dispatchDate?: string;
      carrier?: string;
      trackingNumber?: string;
      handoverReference?: string;
      notes?: string;
    }
  ) {
    const delivery = await prisma.applicationDelivery.findFirst({
      where: { id: deliveryId },
      include: { application: true },
    });

    if (!delivery) throw new NotFoundError("Delivery record");

    let parsedNotes: any = {};
    try {
      parsedNotes = JSON.parse(delivery.notes || "{}");
    } catch {
      parsedNotes = { customNotes: delivery.notes };
    }

    const timeline = parsedNotes.timeline || [];
    timeline.push({
      timestamp: new Date().toISOString(),
      status: "DISPATCHED",
      description: `Dispatched via ${data.carrier || delivery.carrier || "Courier"}${
        data.trackingNumber ? ` (Waybill: ${data.trackingNumber})` : ""
      }`,
      actor: adminEmail,
    });
    parsedNotes.timeline = timeline;
    if (data.notes) parsedNotes.dispatchNotes = data.notes;
    if (data.dispatchDate) parsedNotes.dispatchDate = data.dispatchDate;

    const updated = await prisma.applicationDelivery.update({
      where: { id: deliveryId },
      data: {
        confirmationStatus: "DISPATCHED",
        carrier: data.carrier || delivery.carrier,
        trackingNumber: data.trackingNumber || delivery.trackingNumber,
        notes: JSON.stringify(parsedNotes),
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "DELIVERY_DISPATCHED",
      resource: "ApplicationDelivery",
      resourceId: deliveryId,
      metadata: {
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
      },
    });

    return updated;
  }

  /**
   * Confirm Delivery Fulfillment (Mark Delivered)
   */
  async confirmDelivery(
    deliveryId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    params: {
      deliveredAt?: string;
      receivedBy?: string;
      recipientPhone?: string;
      proofDocumentUrl?: string;
      notes?: string;
    }
  ) {
    const delivery = await prisma.applicationDelivery.findFirst({
      where: { id: deliveryId },
    });

    if (!delivery) throw new NotFoundError("Delivery record");

    let parsedNotes: any = {};
    try {
      parsedNotes = JSON.parse(delivery.notes || "{}");
    } catch {
      parsedNotes = { customNotes: delivery.notes };
    }

    const timeline = parsedNotes.timeline || [];
    timeline.push({
      timestamp: new Date().toISOString(),
      status: "DELIVERED",
      description: `Delivered and confirmed. Received by ${params.receivedBy || delivery.recipientName}`,
      actor: adminEmail,
    });
    parsedNotes.timeline = timeline;
    parsedNotes.receivedBy = params.receivedBy || delivery.recipientName;
    if (params.notes) parsedNotes.deliveryConfirmationNotes = params.notes;

    const updated = await prisma.applicationDelivery.update({
      where: { id: deliveryId },
      data: {
        confirmationStatus: "DELIVERED",
        deliveredAt: params.deliveredAt ? new Date(params.deliveredAt) : new Date(),
        proofDocumentUrl: params.proofDocumentUrl || delivery.proofDocumentUrl,
        notes: JSON.stringify(parsedNotes),
      },
    });

    // Also update associated application status if applicable
    await prisma.application.update({
      where: { id: delivery.applicationId },
      data: {
        status: ApplicationStatus.DELIVERED,
        deliveredAt: new Date(),
        completedAt: new Date(),
        slaStatus: SlaStatus.COMPLETED,
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
      metadata: {
        receivedBy: params.receivedBy,
        proofDocumentUrl: params.proofDocumentUrl,
      },
    });

    return updated;
  }

  /**
   * Report Failed / Returned Delivery
   */
  async reportFailedDelivery(
    deliveryId: string,
    organizationId: string,
    adminId: string,
    adminEmail: string,
    params: {
      failureReason: string;
      notes?: string;
      nextAction?: string;
    }
  ) {
    const delivery = await prisma.applicationDelivery.findFirst({
      where: { id: deliveryId },
    });

    if (!delivery) throw new NotFoundError("Delivery record");

    let parsedNotes: any = {};
    try {
      parsedNotes = JSON.parse(delivery.notes || "{}");
    } catch {
      parsedNotes = { customNotes: delivery.notes };
    }

    const nextState = params.nextAction === "Return to Office" || params.nextAction === "Return to Sender" ? "RETURNED" : "FAILED";

    const timeline = parsedNotes.timeline || [];
    timeline.push({
      timestamp: new Date().toISOString(),
      status: nextState,
      description: `Delivery attempt failed: ${params.failureReason}. Next Action: ${params.nextAction || "Retry"}`,
      actor: adminEmail,
    });
    parsedNotes.timeline = timeline;
    parsedNotes.failureReason = params.failureReason;
    parsedNotes.nextAction = params.nextAction;

    const updated = await prisma.applicationDelivery.update({
      where: { id: deliveryId },
      data: {
        confirmationStatus: nextState,
        notes: JSON.stringify(parsedNotes),
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: UserRole.ADMIN,
      action: "DELIVERY_FAILED",
      resource: "ApplicationDelivery",
      resourceId: deliveryId,
      metadata: {
        failureReason: params.failureReason,
        nextAction: params.nextAction,
      },
    });

    return updated;
  }

  /**
   * Get single delivery details with dossier & client relations
   */
  async getDeliveryById(deliveryId: string, organizationId: string) {
    const delivery = await prisma.applicationDelivery.findFirst({
      where: { id: deliveryId },
      include: {
        application: {
          include: {
            client: true,
            service: true,
            documents: {
              where: { deletedAt: null },
              include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
            },
          },
        },
        deliveredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!delivery) throw new NotFoundError("Delivery record");

    return delivery;
  }

  /**
   * Get deliveries for a specific application (Client view)
   */
  async getDeliveriesForApplication(applicationId: string, organizationId: string) {
    return prisma.applicationDelivery.findMany({
      where: { applicationId },
      include: {
        deliveredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const deliveryService = new DeliveryService();
