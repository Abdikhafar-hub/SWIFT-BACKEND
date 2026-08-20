import { z } from "zod";

export const governmentStatuses = [
  "NOT_STARTED",
  "PREPARING",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "UNDER_PROCESSING",
  "ACTION_REQUIRED",
  "ADDITIONAL_INFORMATION_REQUIRED",
  "ACKNOWLEDGED",
  "RESUBMITTED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
  "UNKNOWN",
] as const;

export const createGovernmentRecordSchema = z.object({
  platform: z.string().min(2, "Platform is required (e.g. eCitizen, BRS, iTax, TIMS)"),
  governmentAgency: z.string().optional().default("eCitizen"),
  governmentService: z.string().optional(),
  externalReference: z.string().min(2, "External tracking or reference number is required"),
  trackingNumber: z.string().optional(),
  status: z.enum(governmentStatuses).optional().default("SUBMITTED"),
  statusDescription: z.string().optional(),
  portalUrl: z.string().url().optional().or(z.literal("")),
  nextFollowUpDate: z.string().datetime().optional(),
  expectedCompletionAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  references: z.array(
    z.object({
      referenceType: z.string().min(1, "Reference type is required"),
      referenceValue: z.string().min(1, "Reference value is required"),
      issuingPlatform: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
  ).optional(),
});

export const updateGovernmentStatusSchema = z.object({
  status: z.enum(governmentStatuses),
  statusDescription: z.string().optional(),
  externalReference: z.string().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  rejectionReason: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  portalUrl: z.string().url().optional().or(z.literal("")),
  approvalDate: z.string().datetime().optional(),
  completionDate: z.string().datetime().optional(),
  expectedCompletionAt: z.string().datetime().optional(),
  source: z.string().default("ADMIN"),
});

export const scheduleGovernmentFollowUpSchema = z.object({
  nextFollowUpDate: z.string().datetime(),
  notes: z.string().optional(),
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
  clientActionType: z.enum([
    "UPLOAD_DOCUMENT",
    "REPLACE_DOCUMENT",
    "PROVIDE_INFORMATION",
    "CONFIRM_INFORMATION",
    "MAKE_PAYMENT",
    "APPROVE_DECLARATION",
    "SIGN_DECLARATION",
    "OTHER",
  ]).optional().default("PROVIDE_INFORMATION"),
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
  clientActionDescription: data.clientActionDescription || data.actionItemDescription || data.description || data.queryDetails || "Please provide the requested information.",
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
  officialDocumentNumber: z.string().optional(),
  approvalNotes: z.string().optional(),
  evidenceDocumentUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  certificateDocumentId: z.string().uuid().optional(),
}).transform((data) => ({
  ...data,
  notes: data.notes || data.approvalNotes || (data.officialDocumentNumber ? `Official doc: ${data.officialDocumentNumber}` : undefined),
}));

export const governmentQueueQuerySchema = z.object({
  agency: z.string().optional(),
  platform: z.string().optional(),
  status: z.enum(governmentStatuses).optional(),
  followUpDue: z.enum(["true", "false"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
