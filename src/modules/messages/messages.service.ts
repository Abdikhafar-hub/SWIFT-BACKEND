import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, NoteVisibility, NotificationChannel, NotificationStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../common/errors/app-error.js";
import { emailService } from "../../infrastructure/email/index.js";
import { smsService } from "../../infrastructure/sms/index.js";
import { formatKenyanPhone } from "../../common/utils/phone-formatter.js";

export interface SendMessageInput {
  applicationId: string;
  organizationId: string;
  senderId: string;
  senderRole: UserRole;
  clientId?: string;
  subject?: string;
  message: string;
  channel?: NotificationChannel;
  sendEmail?: boolean;
  sendSms?: boolean;
  visibility?: NoteVisibility;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export class ApplicationMessageService {
  async sendMessage(input: SendMessageInput) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId, deletedAt: null },
      include: {
        client: { include: { user: true } },
        service: true,
        assignedAdmin: true,
      },
    });

    if (!app) {
      throw new NotFoundError("Application");
    }

    // Client security checks
    if (input.senderRole === UserRole.CLIENT) {
      if (!input.clientId || app.clientId !== input.clientId) {
        throw new ForbiddenError("Cannot send messages on another client's application");
      }
      // Force visibility to CLIENT_VISIBLE for client messages
      input.visibility = NoteVisibility.CLIENT_VISIBLE;
    }

    const visibility = input.visibility || NoteVisibility.CLIENT_VISIBLE;
    const channel = input.channel || NotificationChannel.IN_APP;
    const subject = input.subject || `Re: [${app.service?.name || "Statutory Case"}] ${app.applicationNumber}`;

    let emailMessageId: string | undefined;
    let smsMessageId: string | undefined;

    // 1. Dispatch Email if requested or EMAIL channel selected
    if (input.sendEmail || channel === NotificationChannel.EMAIL) {
      const recipientEmail =
        input.senderRole === UserRole.CLIENT
          ? app.assignedAdmin?.email || "support@swiftdoc.co.ke"
          : app.client.user?.email || app.client.email;

      if (recipientEmail) {
        try {
          const emailRes = await emailService.sendEmail({
            to: recipientEmail,
            subject,
            html: `
              <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="background-color: #0f172a; padding: 16px; border-radius: 6px 6px 0 0; text-align: center;">
                  <h2 style="color: #c5a059; margin: 0; font-size: 20px;">Swift Doc Compliance Communication</h2>
                  <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Case Ref: ${app.applicationNumber} — ${app.service?.name || "Statutory Service"}</p>
                </div>
                <div style="padding: 24px 16px;">
                  <p style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">${subject}</p>
                  <div style="background-color: #f8fafc; padding: 16px; border-left: 4px solid #c5a059; border-radius: 4px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${input.message}</div>
                  <p style="font-size: 12px; color: #64748b; margin-top: 24px;">You can view and reply directly to this thread inside your Swift Doc Executive Portal.</p>
                </div>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
                  Swift Doc Corporate Legal & Statutory Documentation Engine
                </div>
              </div>
            `,
            text: `[Swift Doc - Case ${app.applicationNumber}]\n\n${subject}\n\n${input.message}`,
          });
          if (emailRes?.messageId) {
            emailMessageId = emailRes.messageId;
          }
        } catch (err) {
          console.error("[MESSAGE_SERVICE] Failed to send email dispatch:", err);
        }
      }
    }

    // 2. Dispatch SMS if requested or SMS channel selected
    if (input.sendSms || channel === NotificationChannel.SMS) {
      const recipientPhone =
        input.senderRole === UserRole.CLIENT
          ? undefined // Admins receive in-app / email
          : app.client.phone;

      if (recipientPhone) {
        try {
          const targetPhone = formatKenyanPhone(recipientPhone);
          const smsRes = await smsService.sendSms({
            to: targetPhone,
            message: `Swift Doc [Case #${app.applicationNumber}]: ${input.message.length > 130 ? input.message.slice(0, 127) + '...' : input.message}`,
          });
          if (smsRes?.messageId) {
            smsMessageId = smsRes.messageId;
          }
        } catch (err) {
          console.error("[MESSAGE_SERVICE] Failed to send SMS dispatch:", err);
        }
      }
    }

    // 3. Persist Message in DB transaction
    const messageRecord = await prisma.$transaction(async (tx) => {
      const msg = await tx.applicationMessage.create({
        data: {
          organizationId: input.organizationId,
          applicationId: input.applicationId,
          senderId: input.senderId,
          senderRole: input.senderRole,
          subject,
          channel,
          sendEmail: Boolean(input.sendEmail || channel === NotificationChannel.EMAIL),
          sendSms: Boolean(input.sendSms || channel === NotificationChannel.SMS),
          emailMessageId,
          smsMessageId,
          message: input.message,
          visibility,
          attachments: input.attachments && input.attachments.length > 0
            ? {
                create: input.attachments.map((att) => ({
                  fileName: att.fileName,
                  fileUrl: att.fileUrl,
                  fileSize: att.fileSize,
                  mimeType: att.mimeType,
                })),
              }
            : undefined,
        },
        include: {
          attachments: true,
          sender: { select: { id: true, email: true, role: true } },
        },
      });

      // Log Application activity
      await tx.applicationActivity.create({
        data: {
          applicationId: input.applicationId,
          actorId: input.senderId,
          actorRole: input.senderRole,
          action: "MESSAGE_SENT",
          entityType: "ApplicationMessage",
          entityId: msg.id,
          message: `${input.senderRole === UserRole.CLIENT ? "Client" : "Admin"} sent a message on ${app.applicationNumber}`,
          visibility,
        },
      });

      return msg;
    });

    // 4. Create In-App Notification record
    if (input.senderRole === UserRole.CLIENT) {
      const recipientAdmins = app.assignedAdminId
        ? [{ id: app.assignedAdminId }]
        : await prisma.user.findMany({
            where: { organizationId: input.organizationId, role: UserRole.ADMIN, isActive: true },
            select: { id: true },
          });

      for (const admin of recipientAdmins) {
        await prisma.notification.create({
          data: {
            organizationId: input.organizationId,
            userId: admin.id,
            applicationId: input.applicationId,
            channel: NotificationChannel.IN_APP,
            type: "APPLICATION_MESSAGE",
            title: `New message on ${app.applicationNumber}`,
            message: input.message.length > 120 ? `${input.message.slice(0, 117)}...` : input.message,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }
    } else if (visibility === NoteVisibility.CLIENT_VISIBLE && app.client.user) {
      await prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: app.client.user.id,
          applicationId: input.applicationId,
          channel: NotificationChannel.IN_APP,
          type: "APPLICATION_MESSAGE",
          title: `Officer Dispatch on ${app.applicationNumber}`,
          message: input.message.length > 120 ? `${input.message.slice(0, 117)}...` : input.message,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    }

    return messageRecord;
  }

  // Get aggregated Gmail-like threads across applications
  async getThreads(params: {
    organizationId: string;
    actorRole: UserRole;
    clientId?: string;
    folder?: string; // 'inbox' | 'sent' | 'starred' | 'all'
    search?: string;
  }) {
    const appWhere: any = {
      organizationId: params.organizationId,
      deletedAt: null,
    };

    if (params.actorRole === UserRole.CLIENT) {
      if (!params.clientId) throw new ForbiddenError("Client ID required");
      appWhere.clientId = params.clientId;
    }

    // Fetch applications with their messages
    const applications = await prisma.application.findMany({
      where: appWhere,
      include: {
        client: { select: { id: true, fullName: true, businessName: true, email: true, phone: true } },
        service: { select: { id: true, name: true, category: true } },
        assignedAdmin: { select: { id: true, email: true } },
        messages: {
          where: params.actorRole === UserRole.CLIENT ? { visibility: NoteVisibility.CLIENT_VISIBLE } : {},
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            attachments: true,
            sender: { select: { id: true, email: true, role: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Map applications to Thread DTOs
    const threads = applications
      .map((app) => {
        const lastMessage = app.messages[0] || null;
        const unreadCount = app.messages.filter(
          (m) => !m.isRead && m.senderRole !== params.actorRole
        ).length;
        const hasStarred = app.messages.some((m) => m.isStarred);

        return {
          id: app.id,
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          serviceName: app.service?.name || "Statutory Application",
          clientName: app.client.fullName || app.client.businessName || "Client Entity",
          clientEmail: app.client.email,
          clientPhone: app.client.phone,
          status: app.status,
          updatedAt: app.updatedAt,
          lastMessageAt: lastMessage ? lastMessage.createdAt : app.createdAt,
          lastMessageSnippet: lastMessage ? lastMessage.message : "No messages yet",
          lastSenderRole: lastMessage ? lastMessage.senderRole : null,
          subject: lastMessage?.subject || `[${app.service?.name}] ${app.applicationNumber}`,
          unreadCount,
          isStarred: hasStarred,
          totalMessages: app.messages.length,
          latestChannel: lastMessage?.channel || NotificationChannel.IN_APP,
          sendEmail: lastMessage?.sendEmail || false,
          sendSms: lastMessage?.sendSms || false,
        };
      })
      .filter((t) => {
        // Filter by folder
        if (params.folder === "starred" && !t.isStarred) return false;
        if (params.folder === "unread" && t.unreadCount === 0) return false;
        if (params.search) {
          const q = params.search.toLowerCase();
          const matchApp = t.applicationNumber.toLowerCase().includes(q);
          const matchService = t.serviceName.toLowerCase().includes(q);
          const matchClient = t.clientName.toLowerCase().includes(q);
          const matchSubject = t.subject.toLowerCase().includes(q);
          const matchSnippet = t.lastMessageSnippet.toLowerCase().includes(q);
          return matchApp || matchService || matchClient || matchSubject || matchSnippet;
        }
        return true;
      });

    // Sort by last message date descending
    threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return threads;
  }

  async getMessages(params: {
    applicationId: string;
    organizationId: string;
    actorRole: UserRole;
    clientId?: string;
  }) {
    const app = await prisma.application.findFirst({
      where: { id: params.applicationId, organizationId: params.organizationId, deletedAt: null },
    });

    if (!app) throw new NotFoundError("Application");

    if (params.actorRole === UserRole.CLIENT && app.clientId !== params.clientId) {
      throw new ForbiddenError("Forbidden");
    }

    const where: any = {
      applicationId: params.applicationId,
    };

    if (params.actorRole === UserRole.CLIENT) {
      where.visibility = NoteVisibility.CLIENT_VISIBLE;
    }

    return prisma.applicationMessage.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        attachments: true,
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async toggleStar(messageId: string, applicationId: string) {
    const msg = await prisma.applicationMessage.findFirst({
      where: { id: messageId, applicationId },
    });

    if (!msg) throw new NotFoundError("Message");

    return prisma.applicationMessage.update({
      where: { id: messageId },
      data: { isStarred: !msg.isStarred },
    });
  }

  async markThreadAsRead(applicationId: string, actorRole: UserRole) {
    const opposingRole = actorRole === UserRole.CLIENT ? UserRole.ADMIN : UserRole.CLIENT;

    return prisma.applicationMessage.updateMany({
      where: {
        applicationId,
        senderRole: opposingRole,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}

export const applicationMessageService = new ApplicationMessageService();
