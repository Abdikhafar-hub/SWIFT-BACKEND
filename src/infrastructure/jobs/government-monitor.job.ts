import { prisma } from "../database/prisma.js";
import { GovernmentStatus } from "@prisma/client";

export async function runGovernmentMonitorJob(payload?: { organizationId?: string }) {
  const now = new Date();
  const where: any = {
    application: {
      deletedAt: null,
    },
    status: {
      notIn: [GovernmentStatus.APPROVED, GovernmentStatus.COLLECTED, GovernmentStatus.CLOSED, GovernmentStatus.REJECTED, GovernmentStatus.WITHDRAWN, GovernmentStatus.CANCELLED],
    },
    OR: [
      { nextFollowUpDate: { lte: now } },
      { expectedCompletionAt: { lte: now } },
    ],
  };

  if (payload?.organizationId) {
    where.application.organizationId = payload.organizationId;
  }

  const records = await prisma.governmentApplication.findMany({
    where,
    include: {
      application: {
        select: { id: true, applicationNumber: true, organizationId: true, assignedAdminId: true },
      },
    },
  });

  return {
    overdueOrFollowUpCount: records.length,
    timestamp: now,
  };
}
