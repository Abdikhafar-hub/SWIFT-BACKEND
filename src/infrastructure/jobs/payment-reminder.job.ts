import { prisma } from "../database/prisma.js";
import { ApplicationStatus } from "@prisma/client";
import { notificationOrchestrator, BaseNotificationContext } from "../../modules/notifications/notification-orchestrator.service.js";

export async function runPaymentReminderJob(payload?: { organizationId?: string }) {
  const now = new Date();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const where: any = {
    deletedAt: null,
    dueAmount: { gt: 0 },
    createdAt: { lte: twentyFourHoursAgo },
    status: {
      notIn: [ApplicationStatus.CLOSED, ApplicationStatus.CANCELLED],
    },
  };

  if (payload?.organizationId) {
    where.organizationId = payload.organizationId;
  }

  const applications = await prisma.application.findMany({
    where,
    include: {
      client: { include: { user: true } },
      service: true,
    },
    take: 50,
  });

  return {
    evaluatedCount: applications.length,
    timestamp: now,
  };
}
