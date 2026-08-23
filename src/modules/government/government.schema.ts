import { z } from "zod";

export const governmentStatuses = [
  "NOT_STARTED",
  "PREPARING",
  "READY_TO_SUBMIT",
  "READY_FOR_SUBMISSION",
  "SUBMISSION_IN_PROGRESS",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PAYMENT_REQUIRED",
  "PAYMENT_PENDING",
  "UNDER_PROCESSING",
  "QUERY_RAISED",
  "ADDITIONAL_INFORMATION_REQUIRED",
  "CORRECTION_REQUIRED",
  "APPOINTMENT_REQUIRED",
  "INTERVIEW_REQUIRED",
  "BIOMETRICS_REQUIRED",
  "ON_HOLD",
  "APPROVED",
  "REJECTED",
  "CERTIFICATE_READY",
  "READY_FOR_COLLECTION",
  "COLLECTED",
  "CLOSED",
  "WITHDRAWN",
  "CANCELLED",
  "UNKNOWN",
] as const;

export const governmentSubmissionChannels = [
  "ONLINE_PORTAL",
  "PHYSICAL_OFFICE",
  "EMAIL",
  "COURIER",
  "MANUAL_COUNTER",
  "THIRD_PARTY",
] as const;

export const governmentQueryTypes = [
  "MISSING_DOCUMENT",
  "INCORRECT_INFORMATION",
  "PAYMENT_ISSUE",
  "IDENTITY_VERIFICATION",
  "ADDITIONAL_INFORMATION",
  "CORRECTION_REQUIRED",
  "APPOINTMENT_REQUIRED",
  "TECHNICAL_PORTAL_ISSUE",
  "OTHER",
] as const;

export const governmentQuerySeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const governmentPaymentStatuses = [
  "NOT_REQUIRED",
  "REQUIRED",
  "AWAITING_PAYMENT",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;

export const governmentAppointmentTypes = [
  "BIOMETRICS",
  "PASSPORT_COLLECTION",
  "VISA_INTERVIEW",
  "GOVERNMENT_OFFICE_VISIT",
  "DOCUMENT_COLLECTION",
  "IDENTITY_VERIFICATION",
  "OTHER",
] as const;

export const governmentAppointmentStatuses = [
  "SCHEDULED",
  "ATTENDED",
  "MISSED",
  "RESCHEDULED",
  "CANCELLED",
] as const;

export const governmentFollowUpMethods = [
  "PORTAL",
  "EMAIL",
  "PHONE_CALL",
  "PHYSICAL_VISIT",
  "SMS",
  "OFFICIAL_LETTER",
  "CLIENT_COMMUNICATION",
  "OTHER",
] as const;

export const createGovernmentRecordSchema = z.object({
  applicationId: z.string().uuid("Valid Application ID is required"),
  platform: z.string().min(2, "Platform is required (e.g. eCitizen, BRS, iTax, TIMS, Immigration)"),
  governmentAgency: z.string().min(1, "Government Agency is required").default("eCitizen"),
  governmentService: z.string().optional(),
  department: z.string().optional(),
  submissionChannel: z.enum(governmentSubmissionChannels).default("ONLINE_PORTAL"),
  externalReference: z.string().min(2, "External reference/tracking number is required"),
  trackingNumber: z.string().optional(),
  receiptNumber: z.string().optional(),
  officerContact: z.string().optional(),
  portalUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(governmentStatuses).optional().default("SUBMITTED"),
  statusDescription: z.string().optional(),
  submittedAt: z.string().datetime().optional(),
  expectedTurnaroundDays: z.coerce.number().int().positive().optional(),
  expectedResponseDate: z.string().datetime().optional(),
  nextFollowUpDate: z.string().datetime().optional(),
  followUpFrequencyDays: z.coerce.number().int().positive().default(7),
  primaryOfficerId: z.string().uuid().optional(),
  secondaryOfficerId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  team: z.string().optional(),
  statutoryPaymentStatus: z.enum(governmentPaymentStatuses).default("NOT_REQUIRED"),
  statutoryFeeAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  overridePrerequisites: z.boolean().default(false),
  references: z
    .array(
      z.object({
        referenceType: z.string().min(1, "Reference type is required"),
        referenceValue: z.string().min(1, "Reference value is required"),
        issuingPlatform: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .optional(),
});

export const updateGovernmentStatusSchema = z.object({
  status: z.enum(governmentStatuses),
  statusDescription: z.string().optional(),
  externalReference: z.string().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  remarks: z.string().optional(),
  rejectionReason: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  portalUrl: z.string().url().optional().or(z.literal("")),
  approvalDate: z.string().datetime().optional(),
  completionDate: z.string().datetime().optional(),
  expectedCompletionAt: z.string().datetime().optional(),
  followUpDate: z.string().datetime().optional(),
  queryDetails: z.string().optional(),
  queryResponse: z.string().optional(),
  source: z.string().default("ADMIN"),
}).transform((data) => ({
  ...data,
  notes: data.notes || data.remarks,
  statusDescription: data.statusDescription || data.queryDetails || data.queryResponse,
}));

export const scheduleGovernmentFollowUpSchema = z.object({
  nextFollowUpDate: z.string().datetime(),
  notes: z.string().optional(),
});

export const recordGovernmentFollowUpSchema = z.object({
  attemptedAt: z.string().datetime().optional(),
  method: z.enum(governmentFollowUpMethods).default("PHONE_CALL"),
  contactPerson: z.string().optional(),
  officeContacted: z.string().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpDate: z.string().datetime().optional(),
});

export const recordGovernmentQuerySchema = z.object({
  queryType: z.enum(governmentQueryTypes).default("OTHER"),
  severity: z.enum(governmentQuerySeverities).default("MEDIUM"),
  referenceNumber: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
  responseDeadline: z.string().datetime().optional(),
  description: z.string().min(3, "Query description is required"),
  internalNotes: z.string().optional(),
  createClientAction: z.boolean().default(true),
  clientActionType: z
    .enum([
      "UPLOAD_DOCUMENT",
      "REPLACE_DOCUMENT",
      "PROVIDE_INFORMATION",
      "CONFIRM_INFORMATION",
      "MAKE_PAYMENT",
      "APPROVE_DECLARATION",
      "SIGN_DECLARATION",
      "OTHER",
    ])
    .default("PROVIDE_INFORMATION"),
  clientActionTitle: z.string().optional(),
  clientActionDescription: z.string().optional(),
  requirementId: z.string().uuid().optional(),
});

export const recordGovernmentPaymentSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  currency: z.string().default("KES"),
  paymentMethod: z.enum(["MPESA", "CASH", "BANK", "CARD", "OTHER"]).default("MPESA"),
  paymentReference: z.string().optional(),
  paymentDate: z.string().datetime().optional(),
  receiptNumber: z.string().optional(),
  receiptDocumentUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(governmentPaymentStatuses).default("PAID"),
  notes: z.string().optional(),
});

export const scheduleGovernmentAppointmentSchema = z.object({
  appointmentType: z.enum(governmentAppointmentTypes).default("GOVERNMENT_OFFICE_VISIT"),
  authorityName: z.string().min(2, "Authority name is required"),
  scheduledAt: z.string().datetime("Valid appointment date and time is required"),
  location: z.string().optional(),
  referenceNumber: z.string().optional(),
  officerContact: z.string().optional(),
  clientInstructions: z.string().optional(),
  requiredDocuments: z.array(z.string()).optional(),
  isClientVisible: z.boolean().default(true),
});

export const recordExternalUpdateSchema = z.object({
  status: z.enum(governmentStatuses).optional(),
  source: z.enum(governmentFollowUpMethods).default("PORTAL"),
  receivedAt: z.string().datetime().optional(),
  referenceNumber: z.string().optional(),
  summary: z.string().min(3, "Update summary is required"),
  fullNotes: z.string().optional(),
  governmentOfficer: z.string().optional(),
  nextRequiredAction: z.string().optional(),
  nextFollowUpDate: z.string().datetime().optional(),
  evidenceUrl: z.string().url().optional().or(z.literal("")),
});

export const uploadGovernmentEvidenceSchema = z.object({
  documentName: z.string().min(2, "Document name is required"),
  documentType: z.string().min(2, "Document type is required (e.g. ACKNOWLEDGED, PAYMENT_RECEIPT, SCREENSHOT)"),
  fileUrl: z.string().url("Valid document URL is required"),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE"]).default("CLIENT_VISIBLE"),
});

export const assignGovernmentCaseSchema = z.object({
  primaryOfficerId: z.string().uuid().optional().nullable(),
  secondaryOfficerId: z.string().uuid().optional().nullable(),
  supervisorId: z.string().uuid().optional().nullable(),
  team: z.string().optional().nullable(),
});

export const addGovernmentReferenceSchema = z.object({
  referenceType: z.string().min(1, "Reference type is required (e.g. ECITIZEN_REF, BRS_APP_NO, KRA_REF)"),
  referenceValue: z.string().min(1, "Reference value is required"),
  issuingPlatform: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const requestAdditionalInfoSchema = z.object({
  description: z.string().optional(),
  queryDetails: z.string().optional(),
  deadline: z.string().datetime().optional(),
  clientActionType: z
    .enum([
      "UPLOAD_DOCUMENT",
      "REPLACE_DOCUMENT",
      "PROVIDE_INFORMATION",
      "CONFIRM_INFORMATION",
      "MAKE_PAYMENT",
      "APPROVE_DECLARATION",
      "SIGN_DECLARATION",
      "OTHER",
    ])
    .optional()
    .default("PROVIDE_INFORMATION"),
  clientActionTitle: z.string().optional(),
  actionItemTitle: z.string().optional(),
  clientActionDescription: z.string().optional(),
  actionItemDescription: z.string().optional(),
  requirementId: z.string().uuid().optional(),
  notes: z.string().optional(),
}).transform((data) => ({
  description: data.description || data.queryDetails || "Additional information requested",
  deadline: data.deadline,
  clientActionType: data.clientActionType || "PROVIDE_INFORMATION",
  clientActionTitle: data.clientActionTitle || data.actionItemTitle || "Provide Information",
  clientActionDescription:
    data.clientActionDescription ||
    data.actionItemDescription ||
    data.description ||
    data.queryDetails ||
    "Please provide the requested information.",
  requirementId: data.requirementId,
  notes: data.notes,
}));

export const resubmitGovernmentSchema = z.object({
  notes: z.string().optional(),
  externalReference: z.string().optional(),
  newReference: z.string().optional(),
  trackingNumber: z.string().optional(),
  expectedCompletionAt: z.string().datetime().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
}).transform((data) => ({
  ...data,
  externalReference: data.externalReference || data.newReference,
}));

export const recordGovernmentApprovalSchema = z.object({
  approvalDate: z.string().datetime().optional(),
  completionDate: z.string().datetime().optional(),
  registrationNumber: z.string().optional(),
  officialDocumentNumber: z.string().optional(),
  approvalNotes: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  certificateDocumentId: z.string().uuid().optional(),
}).transform((data) => ({
  ...data,
  notes:
    data.notes ||
    data.approvalNotes ||
    (data.registrationNumber || data.officialDocumentNumber
      ? `Registration/Official doc #: ${data.registrationNumber || data.officialDocumentNumber}`
      : undefined),
}));

export const governmentQueueQuerySchema = z.object({
  agency: z.string().optional(),
  platform: z.string().optional(),
  status: z.enum(governmentStatuses).optional(),
  channel: z.enum(governmentSubmissionChannels).optional(),
  officerId: z.string().uuid().optional(),
  priority: z.string().optional(),
  paymentStatus: z.enum(governmentPaymentStatuses).optional(),
  appointmentStatus: z.enum(governmentAppointmentStatuses).optional(),
  followUpDue: z.enum(["true", "false"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  tabView: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

