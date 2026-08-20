import { prisma } from "../../infrastructure/database/prisma.js";
import { NotificationStatus } from "@prisma/client";
import { NotFoundError } from "../../common/errors/app-error.js";

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  inAppEnabled?: boolean;
  marketingEnabled?: boolean;
}

export class NotificationService {
  async listUserNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const notif = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notif) throw new NotFoundError("Notification");

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, status: { not: NotificationStatus.READ } },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  async getUserPreferences(userId: string) {
    let pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await prisma.notificationPreference.create({
        data: {
          userId,
          emailEnabled: true,
          smsEnabled: true,
          inAppEnabled: true,
          marketingEnabled: false,
        },
      });
    }

    return pref;
  }

  async updateUserPreferences(userId: string, data: UpdatePreferencesInput) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        emailEnabled: data.emailEnabled ?? true,
        smsEnabled: data.smsEnabled ?? true,
        inAppEnabled: data.inAppEnabled ?? true,
        marketingEnabled: data.marketingEnabled ?? false,
      },
    });
  }
}

export const notificationService = new NotificationService();
