import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, NoteVisibility, NotificationChannel, NotificationStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../common/errors/app-error.js";
import { recordAuditLog } from "../../common/utils/audit.js";

export interface SendMessageInput {
  applicationId: string;
  organizationId: string;
  senderId: string;
  senderRole: UserRole;
  clientId?: string;
  message: string;
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

    const messageRecord = await prisma.$transaction(async (tx) => {
      const msg = await tx.applicationMessage.create({
        data: {
          organizationId: input.organizationId,
          applicationId: input.applicationId,
          senderId: input.senderId,
          senderRole: input.senderRole,
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

      // Application activity
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

    // Notify recipient
    if (input.senderRole === UserRole.CLIENT) {
      // Notify assigned admin or all admins in org
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
      // Notify client
      await prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: app.client.user.id,
          applicationId: input.applicationId,
          channel: NotificationChannel.IN_APP,
          type: "APPLICATION_MESSAGE",
          title: `Update on ${app.applicationNumber}`,
          message: input.message.length > 120 ? `${input.message.slice(0, 117)}...` : input.message,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    }

    return messageRecord;
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

  async markAsRead(messageId: string, applicationId: string, userId: string) {
    const msg = await prisma.applicationMessage.findFirst({
      where: { id: messageId, applicationId },
    });

    if (!msg) throw new NotFoundError("Message");

    return prisma.applicationMessage.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

export const applicationMessageService = new ApplicationMessageService();
