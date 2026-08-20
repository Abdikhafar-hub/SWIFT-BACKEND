import { prisma } from "../database/prisma.js";
import { ClientActionStatus } from "@prisma/client";
import { notificationOrchestrator, BaseNotificationContext } from "../../modules/notifications/notification-orchestrator.service.js";

export async function runClientActionReminderJob(payload?: { organizationId?: string }) {
  const now = new Date();
  const fortyEightHoursAhead = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const where: any = {
    status: ClientActionStatus.OPEN,
    dueAt: { not: null, lte: fortyEightHoursAhead },
    application: {
      deletedAt: null,
    },
  };

  if (payload?.organizationId) {
    where.organizationId = payload.organizationId;
  }

  const actions = await prisma.clientAction.findMany({
    where,
    include: {
      application: {
        include: {
          client: { include: { user: true } },
          service: true,
        },
      },
    },
  });

  let remindersSent = 0;

  for (const action of actions) {
    const client = action.application.client;
    if (client.user) {
      const ctx: BaseNotificationContext = {
        organizationId: action.organizationId,
        applicationId: action.application.id,
        applicationNumber: action.application.applicationNumber,
        serviceName: action.application.service.name,
        clientUserId: client.user.id,
        clientName: client.fullName,
        clientEmail: client.email,
        clientPhone: client.phone,
      };

      try {
        await notificationOrchestrator.notifyClientActionRequired(ctx, {
          actionTitle: action.title,
          actionDescription: `Reminder: Action pending on ${action.application.applicationNumber}. ${action.description}`,
          deadline: action.dueAt || undefined,
        });
        remindersSent++;
      } catch (err) {
        console.error(`Failed to send reminder for client action ${action.id}:`, err);
      }
    }
  }

  return {
    evaluatedCount: actions.length,
    remindersSent,
    timestamp: now,
  };
}
