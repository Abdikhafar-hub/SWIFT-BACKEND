import { z } from "zod";

export const clientActionTypes = [
  "UPLOAD_DOCUMENT",
  "REPLACE_DOCUMENT",
  "PROVIDE_INFORMATION",
  "CONFIRM_INFORMATION",
  "MAKE_PAYMENT",
  "APPROVE_DECLARATION",
  "SIGN_DECLARATION",
  "OTHER",
] as const;

export const clientActionPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const createClientActionSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== "object") return val;
  const raw = { ...val };
  if (!raw.type && raw.actionType) {
    raw.type = raw.actionType;
  }
  if (!raw.dueAt && raw.deadline) {
    raw.dueAt = raw.deadline;
  }
  if (raw.instructions && typeof raw.description === "string" && !raw.description.includes("Instructions:")) {
    raw.description = `${raw.description}\n\nInstructions: ${raw.instructions}`;
  }
  return raw;
}, z.object({
  type: z.enum(clientActionTypes),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  priority: z.enum(clientActionPriorities).default("NORMAL"),
  dueAt: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : undefined)),
  requirementId: z.string().uuid().optional(),
}));

export const completeClientActionSchema = z.object({
  completionNotes: z.string().optional(),
  responseNotes: z.string().optional(),
  responsePayload: z.any().optional(),
  responseData: z.any().optional(),
  documentId: z.string().uuid().optional(),
}).transform((data) => ({
  completionNotes: data.completionNotes || data.responseNotes,
  responsePayload: data.responsePayload || data.responseData,
  documentId: data.documentId,
}));

export const updateClientActionSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  priority: z.enum(clientActionPriorities).optional(),
  dueAt: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : undefined)),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
  completionNotes: z.string().optional(),
});

export const cancelClientActionSchema = z.object({
  reason: z.string().min(3, "Cancellation reason is required"),
});

export const listClientActionsQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const listAdminActionsQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
  priority: z.enum(clientActionPriorities).optional(),
  type: z.enum(clientActionTypes).optional(),
  applicationId: z.string().optional(),
  clientId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

