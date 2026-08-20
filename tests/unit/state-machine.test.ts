import { describe, it, expect } from "vitest";
import { ApplicationStatus } from "@prisma/client";
import {
  canTransitionStatus,
  assertValidStatusTransition,
} from "../../src/common/utils/state-machine.js";

describe("Application State Machine", () => {
  it("allows valid forward transitions in the application lifecycle", () => {
    expect(canTransitionStatus(ApplicationStatus.NEW, ApplicationStatus.QUALIFICATION)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.QUALIFICATION, ApplicationStatus.DOCUMENT_REVIEW)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.DOCUMENT_REVIEW, ApplicationStatus.READY_FOR_SUBMISSION)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.READY_FOR_SUBMISSION, ApplicationStatus.SUBMITTED)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.SUBMITTED, ApplicationStatus.GOVERNMENT_PROCESSING)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.GOVERNMENT_PROCESSING, ApplicationStatus.APPROVED)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.APPROVED, ApplicationStatus.READY_FOR_DELIVERY)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.READY_FOR_DELIVERY, ApplicationStatus.DELIVERED)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.DELIVERED, ApplicationStatus.CLOSED)).toBe(true);
  });

  it("permits same-state idempotency", () => {
    expect(canTransitionStatus(ApplicationStatus.NEW, ApplicationStatus.NEW)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.DOCUMENT_REVIEW, ApplicationStatus.DOCUMENT_REVIEW)).toBe(true);
  });

  it("blocks illegal status skips", () => {
    // Cannot skip directly from NEW to DELIVERED or CLOSED
    expect(canTransitionStatus(ApplicationStatus.NEW, ApplicationStatus.DELIVERED)).toBe(false);
    expect(canTransitionStatus(ApplicationStatus.NEW, ApplicationStatus.CLOSED)).toBe(false);
    expect(canTransitionStatus(ApplicationStatus.REQUIREMENTS_PENDING, ApplicationStatus.APPROVED)).toBe(false);

    expect(() =>
      assertValidStatusTransition(ApplicationStatus.NEW, ApplicationStatus.DELIVERED)
    ).toThrowError(/Invalid application status transition/);
  });

  it("supports ON_HOLD and reactivation flows", () => {
    expect(canTransitionStatus(ApplicationStatus.DOCUMENT_REVIEW, ApplicationStatus.ON_HOLD)).toBe(true);
    expect(canTransitionStatus(ApplicationStatus.ON_HOLD, ApplicationStatus.DOCUMENT_REVIEW)).toBe(true);
  });
});
