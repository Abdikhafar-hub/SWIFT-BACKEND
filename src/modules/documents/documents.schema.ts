import { z } from "zod";
import { DOCUMENT_STATUSES } from "../../config/constants.js";

export const uploadDocumentSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  applicationRequirementId: z.string().uuid().optional().nullable(),
  documentType: z.string().min(2, "Document type is required"),
  title: z.string().min(2, "Document title is required"),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  base64Data: z.string().min(1, "File content in base64 is required"),
  expiresAt: z.string().datetime().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  issuingAuthority: z.string().optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
});

export const reviewDocumentSchema = z.object({
  status: z.enum([DOCUMENT_STATUSES.APPROVED, DOCUMENT_STATUSES.REJECTED]),
  reviewNotes: z.string().optional(),
  requestReplacement: z.boolean().default(true),
  replacementDeadline: z.string().datetime().optional(),
});

export const updateDocumentMetadataSchema = z.object({
  title: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  issuingAuthority: z.string().optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const documentQuerySchema = z.object({
  applicationId: z.string().uuid().optional(),
  status: z.enum(["UPLOADED", "PENDING_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "ARCHIVED"]).optional(),
  isExpired: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
