import { ApplicationStatus } from "@prisma/client";

/**
 * Controlled Application State Machine Transition Map
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  NEW: [
    ApplicationStatus.QUALIFICATION,
    ApplicationStatus.REQUIREMENTS_PENDING,
    ApplicationStatus.CANCELLED,
  ],
  QUALIFICATION: [
    ApplicationStatus.REQUIREMENTS_PENDING,
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  REQUIREMENTS_PENDING: [
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.READY_FOR_SUBMISSION,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  DOCUMENT_REVIEW: [
    ApplicationStatus.READY_FOR_SUBMISSION,
    ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ApplicationStatus.REQUIREMENTS_PENDING,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  READY_FOR_SUBMISSION: [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  SUBMITTED: [
    ApplicationStatus.GOVERNMENT_PROCESSING,
    ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  GOVERNMENT_PROCESSING: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ApplicationStatus.DOCUMENT_RECEIVED,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  ADDITIONAL_INFORMATION_REQUIRED: [
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.GOVERNMENT_PROCESSING,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.ON_HOLD,
    ApplicationStatus.CANCELLED,
  ],
  APPROVED: [
    ApplicationStatus.DOCUMENT_RECEIVED,
    ApplicationStatus.QUALITY_CHECK,
    ApplicationStatus.READY_FOR_DELIVERY,
    ApplicationStatus.DELIVERED,
    ApplicationStatus.CLOSED,
  ],
  DOCUMENT_RECEIVED: [
    ApplicationStatus.QUALITY_CHECK,
    ApplicationStatus.READY_FOR_DELIVERY,
    ApplicationStatus.DELIVERED,
  ],
  QUALITY_CHECK: [
    ApplicationStatus.READY_FOR_DELIVERY,
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.DELIVERED,
  ],
  READY_FOR_DELIVERY: [
    ApplicationStatus.DELIVERED,
    ApplicationStatus.CLOSED,
    ApplicationStatus.ON_HOLD,
  ],
  DELIVERED: [
    ApplicationStatus.CLOSED,
  ],
  CLOSED: [
    // Terminal, but Admin can reopen to QUALIFICATION or DOCUMENT_REVIEW with explicit audit
    ApplicationStatus.QUALIFICATION,
    ApplicationStatus.DOCUMENT_REVIEW,
  ],
  ON_HOLD: [
    ApplicationStatus.NEW,
    ApplicationStatus.QUALIFICATION,
    ApplicationStatus.REQUIREMENTS_PENDING,
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.READY_FOR_SUBMISSION,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.GOVERNMENT_PROCESSING,
    ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.READY_FOR_DELIVERY,
    ApplicationStatus.CANCELLED,
  ],
  CANCELLED: [
    // Terminal, but Admin can reopen to NEW or QUALIFICATION with explicit audit
    ApplicationStatus.NEW,
    ApplicationStatus.QUALIFICATION,
  ],
};

export function canTransitionStatus(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidStatusTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransitionStatus(from, to)) {
    throw new Error(`Invalid application status transition from '${from}' to '${to}'.`);
  }
}
