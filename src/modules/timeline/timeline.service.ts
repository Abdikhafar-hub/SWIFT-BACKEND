import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, NoteVisibility } from "@prisma/client";
import { NotFoundError, ForbiddenError } from "../../common/errors/app-error.js";

export interface TimelineEvent {
  id: string;
  type: string;
  category: "APPLICATION" | "DOCUMENT" | "REQUIREMENT" | "GOVERNMENT" | "PAYMENT" | "MESSAGE" | "QUALITY_CHECK" | "DELIVERY" | "NOTE";
  title: string;
  description: string;
  status?: string;
  actorRole?: string;
  actorName?: string;
  visibility: "CLIENT_VISIBLE" | "INTERNAL";
  metadata?: any;
  timestamp: Date;
}

export class ApplicationTimelineService {
  /**
   * Fetch complete forensic timeline for Administrators
   */
  async getAdminTimeline(applicationId: string, organizationId: string): Promise<TimelineEvent[]> {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, deletedAt: null },
      include: {
        client: true,
        service: true,
        activities: { orderBy: { createdAt: "asc" } },
        requirements: {
          include: {
            reviewHistory: { orderBy: { createdAt: "asc" } },
          },
        },
        documents: {
          include: {
            versions: { orderBy: { createdAt: "asc" } },
          },
        },
        governmentApps: {
          include: {
            statusHistory: { orderBy: { createdAt: "asc" } },
          },
        },
        payments: {
          include: {
            transactions: { orderBy: { createdAt: "asc" } },
          },
        },
        messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { email: true, role: true } } } },
        qualityChecks: { orderBy: { createdAt: "asc" }, include: { reviewer: { select: { email: true } } } },
        deliveries: { orderBy: { createdAt: "asc" }, include: { deliveredBy: { select: { email: true } } } },
        notes: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { email: true } } } },
        assignments: { orderBy: { createdAt: "asc" }, include: { assignedAdmin: { select: { email: true } } } },
      },
    });

    if (!app) throw new NotFoundError("Application");

    const events: TimelineEvent[] = [];

    // 1. Application Activities
    for (const act of app.activities) {
      events.push({
        id: `act-${act.id}`,
        type: act.action,
        category: "APPLICATION",
        title: act.action.replace(/_/g, " "),
        description: act.message,
        status: act.toStatus || undefined,
        actorRole: act.actorRole || undefined,
        visibility: act.visibility === NoteVisibility.CLIENT_VISIBLE ? "CLIENT_VISIBLE" : "INTERNAL",
        metadata: act.metadata,
        timestamp: act.createdAt,
      });
    }

    // 2. Requirement Review History
    for (const req of app.requirements) {
      for (const hist of req.reviewHistory) {
        events.push({
          id: `reqhist-${hist.id}`,
          type: `REQUIREMENT_${hist.action}`,
          category: "REQUIREMENT",
          title: `Requirement ${hist.action}: ${req.name}`,
          description: hist.reason || hist.notes || `Requirement "${req.name}" was ${hist.action.toLowerCase()}ed`,
          status: hist.status,
          actorRole: hist.actorRole || undefined,
          visibility: "CLIENT_VISIBLE",
          metadata: { requirementCode: req.code, newValue: hist.newValue },
          timestamp: hist.createdAt,
        });
      }
    }

    // 3. Government Status Histories
    for (const gov of app.governmentApps) {
      for (const hist of gov.statusHistory) {
        events.push({
          id: `govhist-${hist.id}`,
          type: "GOVERNMENT_STATUS_CHANGE",
          category: "GOVERNMENT",
          title: `${gov.governmentAgency} (${gov.platform}): ${hist.toStatus}`,
          description: hist.statusDescription || hist.notes || `Government status updated to ${hist.toStatus}`,
          status: hist.toStatus,
          actorRole: "ADMIN",
          visibility: "CLIENT_VISIBLE",
          metadata: { agency: gov.governmentAgency, externalReference: gov.externalReference },
          timestamp: hist.createdAt,
        });
      }
    }

    // 4. Payment Transactions
    for (const pmt of app.payments) {
      for (const tx of pmt.transactions) {
        events.push({
          id: `tx-${tx.id}`,
          type: "PAYMENT_TRANSACTION",
          category: "PAYMENT",
          title: `Payment: ${tx.currency} ${tx.amount}`,
          description: `Payment transaction ${tx.transactionNumber} (${tx.paymentMethod}) - Status: ${tx.status}${tx.externalReference ? ` [Receipt: ${tx.externalReference}]` : ""}`,
          status: tx.status,
          actorRole: "CLIENT",
          visibility: "CLIENT_VISIBLE",
          metadata: { invoiceNumber: pmt.invoiceNumber, transactionNumber: tx.transactionNumber },
          timestamp: tx.createdAt,
        });
      }
    }

    // 5. Messages
    for (const msg of app.messages) {
      events.push({
        id: `msg-${msg.id}`,
        type: "MESSAGE",
        category: "MESSAGE",
        title: `Message from ${msg.sender.email} (${msg.senderRole})`,
        description: msg.message,
        actorRole: msg.senderRole,
        actorName: msg.sender.email,
        visibility: msg.visibility === NoteVisibility.CLIENT_VISIBLE ? "CLIENT_VISIBLE" : "INTERNAL",
        timestamp: msg.createdAt,
      });
    }

    // 6. Quality Checks
    for (const qc of app.qualityChecks) {
      events.push({
        id: `qc-${qc.id}`,
        type: "QUALITY_CHECK",
        category: "QUALITY_CHECK",
        title: `Quality Check: ${qc.result}`,
        description: qc.notes || qc.failedReason || `Quality check completed by ${qc.reviewer.email}`,
        status: qc.result,
        actorRole: "ADMIN",
        actorName: qc.reviewer.email,
        visibility: "INTERNAL",
        metadata: { checklist: qc.checklist },
        timestamp: qc.createdAt,
      });
    }

    // 7. Deliveries
    for (const del of app.deliveries) {
      events.push({
        id: `del-${del.id}`,
        type: "DELIVERY",
        category: "DELIVERY",
        title: `Delivery: ${del.deliveryMethod} (${del.confirmationStatus})`,
        description: `Delivered to ${del.recipientName} (${del.recipientPhone})${del.trackingNumber ? ` - Courier Ref: ${del.trackingNumber}` : ""}`,
        status: del.confirmationStatus,
        actorRole: "ADMIN",
        visibility: "CLIENT_VISIBLE",
        metadata: { trackingNumber: del.trackingNumber, carrier: del.carrier },
        timestamp: del.createdAt,
      });
    }

    // 8. Internal Notes
    for (const note of app.notes) {
      events.push({
        id: `note-${note.id}`,
        type: "INTERNAL_NOTE",
        category: "NOTE",
        title: `Note by ${note.author.email}`,
        description: note.content,
        actorRole: "ADMIN",
        actorName: note.author.email,
        visibility: note.visibility === NoteVisibility.CLIENT_VISIBLE ? "CLIENT_VISIBLE" : "INTERNAL",
        timestamp: note.createdAt,
      });
    }

    // Sort all events chronologically (latest first or earliest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events;
  }

  /**
   * Fetch Client-Safe Sanitized Timeline
   */
  async getClientTimeline(applicationId: string, organizationId: string, clientId: string): Promise<TimelineEvent[]> {
    const adminEvents = await this.getAdminTimeline(applicationId, organizationId);

    // Verify ownership
    const app = await prisma.application.findFirst({
      where: { id: applicationId, organizationId, clientId, deletedAt: null },
      select: { id: true },
    });

    if (!app) throw new NotFoundError("Application");

    // Filter strictly for client-visible events and strip internal identifiers/notes
    return adminEvents
      .filter((e) => e.visibility === "CLIENT_VISIBLE")
      .map((e) => ({
        id: e.id,
        type: e.type,
        category: e.category,
        title: e.title,
        description: e.description,
        status: e.status,
        visibility: "CLIENT_VISIBLE",
        timestamp: e.timestamp,
      }));
  }
}

export const applicationTimelineService = new ApplicationTimelineService();
