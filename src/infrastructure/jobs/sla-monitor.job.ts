import { slaService } from "../../modules/sla/sla.service.js";

export async function runSlaMonitorJob(payload?: { organizationId?: string }) {
  return slaService.performSlaSweep(payload?.organizationId);
}
