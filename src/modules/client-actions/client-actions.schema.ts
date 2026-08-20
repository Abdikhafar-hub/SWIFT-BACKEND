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

export const createClientActionSchema = z.object({
  type: z.enum(clientActionTypes),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  priority: z.enum(clientActionPriorities).default("NORMAL"),
  dueAt: z.string().datetime().optional(),
  requirementId: z.string().uuid().optional(),
});

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

export const cancelClientActionSchema = z.object({
  reason: z.string().min(3, "Cancellation reason is required"),
});

export const listClientActionsQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
