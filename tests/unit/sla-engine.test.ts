import { describe, it, expect } from "vitest";
import { SlaService } from "../../src/modules/sla/sla.service.js";
import { ApplicationStatus, SlaStatus } from "@prisma/client";

describe("SLA Engine Unit Tests", () => {
  const slaService = new SlaService();

  it("should evaluate active application with ample time as ON_TRACK", () => {
    const startedAt = new Date();
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours in future

    const result = slaService.evaluateApplicationSla({
      status: ApplicationStatus.DOCUMENT_REVIEW,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(result.currentStatus).toBe(SlaStatus.ON_TRACK);
    expect(result.isOverdue).toBe(false);
    expect(result.isAtRisk).toBe(false);
    expect(result.remainingHours).toBeGreaterThan(24);
  });

  it("should evaluate active application with <= 24h as AT_RISK", () => {
    const startedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours remaining

    const result = slaService.evaluateApplicationSla({
      status: ApplicationStatus.GOVERNMENT_PROCESSING,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(result.currentStatus).toBe(SlaStatus.AT_RISK);
    expect(result.isAtRisk).toBe(true);
    expect(result.isOverdue).toBe(false);
  });

  it("should evaluate past deadline application as OVERDUE", () => {
    const startedAt = new Date(Date.now() - 96 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours past deadline

    const result = slaService.evaluateApplicationSla({
      status: ApplicationStatus.GOVERNMENT_PROCESSING,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
    });

    expect(result.currentStatus).toBe(SlaStatus.OVERDUE);
    expect(result.isOverdue).toBe(true);
    expect(result.remainingHours).toBeLessThan(0);
  });

  it("should evaluate delivered or closed application as COMPLETED", () => {
    const startedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const completedAt = new Date();

    const result = slaService.evaluateApplicationSla({
      status: ApplicationStatus.DELIVERED,
      startedAt,
      dueAt,
      pausedAt: null,
      totalPausedDuration: 0,
      completedAt,
    });

    expect(result.currentStatus).toBe(SlaStatus.COMPLETED);
    expect(result.isOverdue).toBe(false);
  });
});
