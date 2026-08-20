import { describe, it, expect } from "vitest";
import { NotificationOrchestratorService } from "../../src/modules/notifications/notification-orchestrator.service.js";

describe("Kenyan Phone Normalizer Unit Tests", () => {
  const orchestrator = new NotificationOrchestratorService();

  it("should format local 07... numbers to +2547...", () => {
    expect(orchestrator.normalizePhoneNumber("0712345678")).toBe("+254712345678");
  });

  it("should format local 01... numbers to +2541...", () => {
    expect(orchestrator.normalizePhoneNumber("0112345678")).toBe("+254112345678");
  });

  it("should format 254... numbers to +254...", () => {
    expect(orchestrator.normalizePhoneNumber("254712345678")).toBe("+254712345678");
  });

  it("should preserve already normalized +254... numbers", () => {
    expect(orchestrator.normalizePhoneNumber("+254712345678")).toBe("+254712345678");
  });

  it("should strip out spaces and hyphens", () => {
    expect(orchestrator.normalizePhoneNumber(" 0712 - 345 - 678 ")).toBe("+254712345678");
  });
});
