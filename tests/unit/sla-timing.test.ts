import { describe, it, expect } from "vitest";
import { SlaService } from "../../src/modules/sla/sla.service.js";
import { ApplicationStatus, SlaStatus } from "@prisma/client";

describe("SLA Timing Engine", () => {
  const slaService = new SlaService();

  it("calculates ON_TRACK for application well within deadline", () => {
    const startedAt = new Date();
    const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const evaluation = slaService.evaluateApplicationSla({
      status: ApplicationStatus.GOVERNMENT_PROCESSING,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(evaluation.currentStatus).toBe(SlaStatus.ON_TRACK);
    expect(evaluation.isPaused).toBe(false);
  });

  it("calculates AT_RISK when nearing deadline", () => {
    const startedAt = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    const evaluation = slaService.evaluateApplicationSla({
      status: ApplicationStatus.GOVERNMENT_PROCESSING,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(evaluation.currentStatus).toBe(SlaStatus.AT_RISK);
    expect(evaluation.isAtRisk).toBe(true);
  });

  it("calculates OVERDUE when dueAt has passed", () => {
    const startedAt = new Date(Date.now() - 50 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const evaluation = slaService.evaluateApplicationSla({
      status: ApplicationStatus.GOVERNMENT_PROCESSING,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(evaluation.currentStatus).toBe(SlaStatus.OVERDUE);
    expect(evaluation.isOverdue).toBe(true);
  });

  it("returns isPaused true when pausedAt is set", () => {
    const startedAt = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() + 20 * 60 * 60 * 1000);

    const evaluation = slaService.evaluateApplicationSla({
      status: ApplicationStatus.CLIENT_ACTION_REQUIRED,
      startedAt,
      dueAt,
      pausedAt: new Date(),
      totalPausedDuration: 0,
    });

    expect(evaluation.isPaused).toBe(true);
  });
});
