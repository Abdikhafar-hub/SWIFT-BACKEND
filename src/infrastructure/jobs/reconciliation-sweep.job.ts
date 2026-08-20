import { prisma } from "../database/prisma.js";
import { reconciliationService } from "../../modules/financial/reconciliation.service.js";

export async function runReconciliationSweepJob(payload?: { organizationId?: string }) {
  let orgIds: string[] = [];

  if (payload?.organizationId) {
    orgIds = [payload.organizationId];
  } else {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    orgIds = orgs.map((o) => o.id);
  }

  const results = [];
  for (const orgId of orgIds) {
    const res = await reconciliationService.runReconciliationMatching(orgId);
    results.push({ organizationId: orgId, ...res });
  }

  return {
    sweptOrganizations: orgIds.length,
    results,
    timestamp: new Date().toISOString(),
  };
}
