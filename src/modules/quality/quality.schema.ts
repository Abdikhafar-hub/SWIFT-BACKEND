import { z } from "zod";

export const performQualityCheckSchema = z.object({
  result: z.enum(["PASSED", "FAILED"]),
  checklist: z.record(z.boolean()),
  notes: z.string().optional(),
  failedReason: z.string().optional(),
});

export const startQcInspectionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  reviewerId: z.string().uuid("Invalid reviewer ID").optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  notes: z.string().optional(),
});

export const reviewQcItemSchema = z.object({
  requirementId: z.string().uuid("Invalid requirement ID"),
  documentId: z.string().uuid("Invalid document ID").optional(),
  action: z.enum(["PASS", "FAIL", "REQUEST_REPLACEMENT", "NOT_APPLICABLE"]),
  deficiencyCategory: z
    .enum([
      "ILLEGIBLE",
      "EXPIRED",
      "INCORRECT_DOCUMENT",
      "INCOMPLETE",
      "INFORMATION_MISMATCH",
      "MISSING_PAGES",
      "INVALID_FORMAT",
      "OTHER",
    ])
    .optional(),
  reviewerFeedback: z.string().optional(),
  notes: z.string().optional(),
});

export const qcDecisionSchema = z.object({
  decision: z.enum(["CERTIFY_PASS", "RETURN_TO_CLIENT", "FAIL_FLAG", "SAVE_PROGRESS"]),
  checklist: z.record(z.boolean()).optional(),
  notes: z.string().optional(),
  failedReason: z.string().optional(),
});

export const qcQueueQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["ALL", "PENDING", "IN_PROGRESS", "PASSED", "RETURNED", "FAILED", "FLAGGED"]).optional(),
  priority: z.enum(["ALL", "LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  serviceId: z.string().optional(),
  reviewerId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
});
