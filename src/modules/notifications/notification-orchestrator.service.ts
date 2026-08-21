import { prisma } from "../../infrastructure/database/prisma.js";
import { emailService } from "../../infrastructure/email/index.js";
import { smsService } from "../../infrastructure/sms/index.js";
import { NotificationChannel, NotificationStatus, UserRole } from "@prisma/client";
import { NotificationTemplates } from "./notification-templates.js";

export interface BaseNotificationContext {
  organizationId: string;
  applicationId: string;
  applicationNumber: string;
  serviceName: string;
  clientUserId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
}

export class NotificationOrchestratorService {
  /**
   * Normalize Kenyan phone numbers to E.164 (+254...)
   */
  normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");
    if (cleaned.startsWith("+254")) return cleaned;
    if (cleaned.startsWith("254")) return `+${cleaned}`;
    if (cleaned.startsWith("0")) return `+254${cleaned.slice(1)}`;
    if (cleaned.startsWith("7") || cleaned.startsWith("1")) return `+254${cleaned}`;
    return cleaned;
  }

  /**
   * Helper to check and record deduplication key
   */
  private async isDuplicate(key: string, organizationId?: string): Promise<boolean> {
    const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
    if (existing) return true;

    try {
      await prisma.idempotencyRecord.create({
        data: {
          key,
          organizationId,
          resource: "NOTIFICATION",
          status: "COMPLETED",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Retrieve or create default notification preferences for a user
   */
  async getUserPreferences(userId: string) {
    let pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      try {
        pref = await prisma.notificationPreference.create({
          data: {
            userId,
            emailEnabled: true,
            smsEnabled: true,
            inAppEnabled: true,
            marketingEnabled: false,
          },
        });
      } catch {
        // Fallback defaults
        return { emailEnabled: true, smsEnabled: true, inAppEnabled: true };
      }
    }

    return pref;
  }

  /**
   * 1. Application Created Notification
   */
  async notifyApplicationCreated(ctx: BaseNotificationContext): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const tmpl = NotificationTemplates.applicationCreated({
      clientName: ctx.clientName,
      applicationNumber: ctx.applicationNumber,
      serviceName: ctx.serviceName,
    });

    // 1. In-App Notification
    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "APPLICATION_CREATED",
            title: tmpl.title,
            message: tmpl.sms,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    // 2. Transactional Email
    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendEmail({
          to: ctx.clientEmail,
          subject: tmpl.title,
          html: tmpl.html,
          text: tmpl.sms,
        });
      } catch (err) {
        console.error("Email send failed (non-blocking):", err);
      }
    }

    // 3. SMS
    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed (non-blocking):", err);
      }
    }
  }

  /**
   * Application Status Transition Notification
   */
  async notifyStatusTransition(
    ctx: BaseNotificationContext,
    params: { fromStatus: string; toStatus: string; reason?: string }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const tmpl = NotificationTemplates.applicationStatusUpdated({
      clientName: ctx.clientName,
      applicationNumber: ctx.applicationNumber,
      serviceName: ctx.serviceName,
      status: params.toStatus,
      statusDescription: params.reason,
    });

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "APPLICATION_STATUS_UPDATE",
            title: tmpl.title,
            message: `Status updated from ${params.fromStatus} to ${params.toStatus}. ${params.reason || ""}`.trim(),
            status: NotificationStatus.DELIVERED,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("In-app notification creation failed (non-blocking):", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendEmail({
          to: ctx.clientEmail,
          subject: tmpl.title,
          html: tmpl.html,
        });
      } catch (err) {
        console.error("Email send failed (non-blocking):", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed (non-blocking):", err);
      }
    }
  }

  /**
   * 2. Requirement Review (Approved, Rejected, Correction Required)
   */
  async notifyRequirementReview(
    ctx: BaseNotificationContext,
    params: { reqName: string; status: string; reason?: string; notes?: string }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const isApproved = params.status === "APPROVED";
    const title = isApproved
      ? `Requirement Approved: ${params.reqName}`
      : `Action Required: Correction needed for ${params.reqName}`;

    const message = isApproved
      ? `Your requirement "${params.reqName}" for ${ctx.applicationNumber} has been verified and approved.`
      : `Your requirement "${params.reqName}" for ${ctx.applicationNumber} requires correction. Reason: ${params.reason || "Please review and re-submit."}`;

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: isApproved ? "REQUIREMENT_APPROVED" : "REQUIREMENT_CORRECTION_REQUIRED",
            title,
            message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        if (isApproved) {
          await emailService.sendDocumentApprovedEmail(ctx.clientEmail, ctx.clientName, ctx.applicationNumber, params.reqName);
        } else {
          await emailService.sendDocumentRejectedEmail(ctx.clientEmail, ctx.clientName, ctx.applicationNumber, params.reqName, params.reason || "Please review and re-submit.");
        }
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone && !isApproved) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        const smsText = `Swift Doc: Correction required on "${params.reqName}" for ${ctx.applicationNumber}. Check portal for details.`;
        await smsService.sendSms({ to: normalizedPhone, message: smsText });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 3. Client Action Required (Generic / Government Query / Document Replacement)
   */
  async notifyClientActionRequired(
    ctx: BaseNotificationContext,
    params: { actionTitle: string; actionDescription: string; deadline?: Date }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const tmpl = NotificationTemplates.clientActionRequired({
      clientName: ctx.clientName,
      applicationNumber: ctx.applicationNumber,
      serviceName: ctx.serviceName,
      actionTitle: params.actionTitle,
      actionDescription: params.actionDescription,
      deadline: params.deadline,
    });

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "CLIENT_ACTION_REQUIRED",
            title: tmpl.title,
            message: params.actionDescription,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendEmail({ to: ctx.clientEmail, subject: tmpl.title, html: tmpl.html, text: tmpl.sms });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 4. Government Processing Update
   */
  async notifyGovernmentUpdate(
    ctx: BaseNotificationContext,
    params: { agency: string; externalReference?: string; status: string; statusDescription?: string }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const tmpl = NotificationTemplates.governmentUpdate({
      clientName: ctx.clientName,
      applicationNumber: ctx.applicationNumber,
      serviceName: ctx.serviceName,
      agency: params.agency,
      externalReference: params.externalReference,
      status: params.status,
      statusDescription: params.statusDescription,
    });

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "GOVERNMENT_UPDATE",
            title: tmpl.title,
            message: `Government processing update from ${params.agency}: Status is ${params.status}`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendEmail({ to: ctx.clientEmail, subject: tmpl.title, html: tmpl.html, text: tmpl.sms });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 5. Delivery Dispatched / Completed
   */
  async notifyDeliveryDispatched(
    ctx: BaseNotificationContext,
    params: { deliveryMethod: string; trackingNumber?: string; recipientName?: string }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const tmpl = NotificationTemplates.deliveryDispatched({
      clientName: ctx.clientName,
      applicationNumber: ctx.applicationNumber,
      serviceName: ctx.serviceName,
      deliveryMethod: params.deliveryMethod,
      trackingNumber: params.trackingNumber,
    });

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "DELIVERY_DISPATCHED",
            title: tmpl.title,
            message: `Your document for ${ctx.serviceName} has been dispatched via ${params.deliveryMethod}`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendEmail({ to: ctx.clientEmail, subject: tmpl.title, html: tmpl.html, text: tmpl.sms });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  async notifyDeliveryReady(
    ctx: BaseNotificationContext,
    params: { deliveryMethod: string; secureDownloadUrl?: string; dispatchRef?: string }
  ): Promise<void> {
    return this.notifyDeliveryDispatched(ctx, {
      deliveryMethod: params.deliveryMethod,
      trackingNumber: params.dispatchRef,
    });
  }

  async notifyPaymentReceived(
    ctx: BaseNotificationContext,
    params: {
      amount: number | any;
      currency?: string;
      receiptNumber?: string;
      invoiceNumber?: string;
      transactionNumber?: string;
      remainingBalance?: string | number;
      channel?: string;
    }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const formattedAmount = `${params.currency || "KES"} ${Number(params.amount).toLocaleString()}`;
    const ref = params.receiptNumber || params.transactionNumber || "N/A";
    const tmpl = {
      title: `Payment Received: ${formattedAmount}`,
      emailSubject: `Payment Confirmation: ${formattedAmount} for ${ctx.applicationNumber}`,
      emailBody: `Thank you for your payment of ${formattedAmount} for application ${ctx.applicationNumber} (${ctx.serviceName}).\nReceipt/Ref: ${ref}\nInvoice: ${params.invoiceNumber || "N/A"}`,
      sms: `Swift Doc: Payment of ${formattedAmount} received for ${ctx.applicationNumber}. Ref: ${ref}.`,
    };

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "PAYMENT_RECEIVED",
            title: tmpl.title,
            message: `Payment of ${formattedAmount} confirmed for ${ctx.serviceName}. Ref: ${ref}`.trim(),
            status: NotificationStatus.DELIVERED,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("In-app notification creation failed (non-blocking):", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        await emailService.sendPaymentReceivedEmail(
          ctx.clientEmail,
          ctx.clientName,
          ctx.applicationNumber,
          String(params.amount),
          ref,
          params.transactionNumber
        );
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 6. SLA Alert (Warning / Overdue)
   */
  async notifySlaAlert(
    ctx: BaseNotificationContext,
    params: { alertType: "WARNING" | "OVERDUE"; remainingHours: number }
  ): Promise<void> {
    const isOverdue = params.alertType === "OVERDUE";
    const dedupKey = `SLA_${params.alertType}_${ctx.applicationId}_${new Date().toISOString().slice(0, 10)}`;
    const isDup = await this.isDuplicate(dedupKey, ctx.organizationId);
    if (isDup) return;

    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const title = isOverdue
      ? `Processing Update: ${ctx.applicationNumber} - Extended Verification`
      : `Application On Schedule: ${ctx.applicationNumber}`;

    const message = isOverdue
      ? `Your application ${ctx.applicationNumber} is undergoing additional verification with government registries. Our team is actively expediting.`
      : `Your application ${ctx.applicationNumber} is progressing well and approaching final completion stages.`;

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: isOverdue ? "SLA_OVERDUE" : "SLA_WARNING",
            title,
            message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #0f172a; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
              <h2 style="color: #f59e0b; margin: 0;">SWIFT DOC KENYA</h2>
            </div>
            <div style="padding: 20px; background-color: #ffffff;">
              <h3 style="color: #1e293b;">${title}</h3>
              <p>Dear ${ctx.clientName},</p>
              <p>${message}</p>
              <p>Thank you for your patience as we finalize your official filing.</p>
            </div>
          </div>
        `;
        await emailService.sendEmail({ to: ctx.clientEmail, subject: title, html: emailHtml, text: message });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }
  }

  /**
   * 7. Document Expiry Warning (30, 60, 90 days before expiry)
   */
  async notifyDocumentExpiry(
    userId: string,
    organizationId: string,
    clientName: string,
    clientEmail: string,
    clientPhone: string,
    documentTitle: string,
    expiryDate: Date
  ): Promise<void> {
    const dedupKey = `DOC_EXPIRY_${userId}_${documentTitle}_${expiryDate.toISOString().slice(0, 10)}`;
    const isDup = await this.isDuplicate(dedupKey, organizationId);
    if (isDup) return;

    const prefs = await this.getUserPreferences(userId);
    const tmpl = NotificationTemplates.documentExpiryWarning({
      clientName,
      documentTitle,
      expiryDate,
    });

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            channel: NotificationChannel.IN_APP,
            type: "DOCUMENT_EXPIRY_WARNING",
            title: tmpl.title,
            message: tmpl.sms,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && clientEmail) {
      try {
        await emailService.sendEmail({ to: clientEmail, subject: tmpl.title, html: tmpl.html, text: tmpl.sms });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message: tmpl.sms });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 8. Invoice Issued Notification
   */
  async notifyInvoiceIssued(params: {
    organizationId: string;
    clientId: string;
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: string;
    dueAt: string | null;
    applicationNumber: string;
    serviceName: string;
  }): Promise<void> {
    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
      include: { user: true },
    });

    if (!client || !client.user) return;

    const prefs = await this.getUserPreferences(client.user.id);
    const title = `Invoice Issued: ${params.invoiceNumber} (KES ${params.totalAmount})`;
    const message = `Your invoice ${params.invoiceNumber} for ${params.serviceName} (${params.applicationNumber}) has been issued. Total amount: KES ${params.totalAmount}. Due: ${params.dueAt ? new Date(params.dueAt).toLocaleDateString() : "Upon Receipt"}.`;

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: params.organizationId,
            userId: client.user.id,
            channel: NotificationChannel.IN_APP,
            type: "INVOICE_ISSUED",
            title,
            message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && client.email) {
      try {
        await emailService.sendInvoiceIssuedEmail(
          client.email,
          client.fullName,
          params.invoiceNumber,
          params.applicationNumber,
          params.serviceName,
          params.totalAmount,
          params.dueAt
        );
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && client.phone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(client.phone);
        await smsService.sendSms({ to: normalizedPhone, message });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 9. Refund Completed Notification
   */
  async notifyRefundCompleted(params: {
    organizationId: string;
    clientId: string;
    refundNumber: string;
    amount: string;
    invoiceNumber: string;
    applicationNumber: string;
  }): Promise<void> {
    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
      include: { user: true },
    });

    if (!client || !client.user) return;

    const prefs = await this.getUserPreferences(client.user.id);
    const title = `Refund Processed: ${params.refundNumber} (KES ${params.amount})`;
    const message = `A refund of KES ${params.amount} (Ref: ${params.refundNumber}) for invoice ${params.invoiceNumber} (${params.applicationNumber}) has been processed successfully.`;

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: params.organizationId,
            userId: client.user.id,
            channel: NotificationChannel.IN_APP,
            type: "REFUND_PROCESSED",
            title,
            message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && client.email) {
      try {
        await emailService.sendRefundCompletedEmail(
          client.email,
          client.fullName,
          params.refundNumber,
          params.amount,
          params.invoiceNumber,
          params.applicationNumber
        );
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && client.phone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(client.phone);
        await smsService.sendSms({ to: normalizedPhone, message });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * 10. Payment Reminder Notification
   */
  async notifyPaymentReminder(
    ctx: BaseNotificationContext,
    params: {
      invoiceNumber: string;
      amountDue: string;
      dueDate: string;
    }
  ): Promise<void> {
    const prefs = await this.getUserPreferences(ctx.clientUserId);
    const title = `Payment Reminder: Invoice ${params.invoiceNumber}`;
    const message = `Reminder: An outstanding balance of KES ${params.amountDue} for ${ctx.serviceName} (${ctx.applicationNumber}) is due on ${params.dueDate}. Please finalize payment to avoid processing delays.`;

    if (prefs.inAppEnabled) {
      try {
        await prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.clientUserId,
            applicationId: ctx.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "PAYMENT_REMINDER",
            title,
            message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create in-app notification:", err);
      }
    }

    if (prefs.emailEnabled && ctx.clientEmail) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #0f172a; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
              <h2 style="color: #f59e0b; margin: 0;">SWIFT DOC PAYMENT REMINDER</h2>
            </div>
            <div style="padding: 20px; background-color: #ffffff;">
              <h3 style="color: #1e293b;">${title}</h3>
              <p>Dear ${ctx.clientName},</p>
              <p>${message}</p>
            </div>
          </div>
        `;
        await emailService.sendEmail({ to: ctx.clientEmail, subject: title, html: emailHtml, text: message });
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    if (prefs.smsEnabled && ctx.clientPhone) {
      try {
        const normalizedPhone = this.normalizePhoneNumber(ctx.clientPhone);
        await smsService.sendSms({ to: normalizedPhone, message });
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }
  }

  /**
   * Notify Admins when a new client registers on Swift Doc
   */
  async notifyAdminNewRegistration(ctx: {
    organizationId: string;
    clientId: string;
    clientNumber: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientType: string;
  }): Promise<void> {
    try {
      // Find all active admins in the organization
      const admins = await prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: UserRole.ADMIN,
          isActive: true,
          deletedAt: null,
        },
      });

      if (admins.length === 0) return;

      const tmpl = NotificationTemplates.adminNewRegistration({
        clientName: ctx.clientName,
        clientNumber: ctx.clientNumber,
        clientEmail: ctx.clientEmail,
        clientPhone: ctx.clientPhone,
        clientType: ctx.clientType,
      });

      for (const admin of admins) {
        const prefs = await this.getUserPreferences(admin.id);

        // 1. In-App Notification
        if (prefs.inAppEnabled) {
          try {
            await prisma.notification.create({
              data: {
                organizationId: ctx.organizationId,
                userId: admin.id,
                clientId: ctx.clientId,
                channel: NotificationChannel.IN_APP,
                type: "ADMIN_NEW_REGISTRATION",
                title: tmpl.title,
                message: `New client registration: ${ctx.clientName} (${ctx.clientNumber}, ${ctx.clientType}). Ready for administrative review.`,
                status: NotificationStatus.SENT,
                sentAt: new Date(),
                metadata: {
                  clientId: ctx.clientId,
                  clientNumber: ctx.clientNumber,
                  clientType: ctx.clientType,
                  clientEmail: ctx.clientEmail,
                  clientPhone: ctx.clientPhone,
                },
              },
            });
          } catch (err) {
            console.error(`Failed to create in-app notification for admin ${admin.id}:`, err);
          }
        }

        // 2. Email Notification
        if (prefs.emailEnabled && admin.email) {
          try {
            await emailService.sendEmail({
              to: admin.email,
              subject: tmpl.title,
              html: tmpl.html,
              text: `New client ${ctx.clientName} (${ctx.clientNumber}) has registered. Please review in the Admin Command Center.`,
            });
          } catch (err) {
            console.error(`Failed to send email to admin ${admin.email}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("Failed to notify admins of new registration:", error);
    }
  }
}

export const notificationOrchestrator = new NotificationOrchestratorService();

