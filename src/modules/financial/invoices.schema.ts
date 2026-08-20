import { z } from "zod";
import { PaymentStatus, InvoiceLineItemCategory, AdjustmentType } from "@prisma/client";

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  category: z.nativeEnum(InvoiceLineItemCategory).default(InvoiceLineItemCategory.SERVICE_FEE),
  quantity: z.number().int().min(1).default(1),
  unitAmount: z.number().min(0, "Unit amount cannot be negative"),
  isGovernmentFee: z.boolean().default(false),
  isTaxable: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

export const createInvoiceSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  clientId: z.string().uuid("Invalid client ID").optional(),
  lineItems: z.array(lineItemSchema).optional(),
  governmentFee: z.number().min(0).optional(),
  serviceFee: z.number().min(0).optional(),
  otherFee: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  dueAt: z.string().datetime().or(z.string()).optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
});

export const updateDraftInvoiceSchema = z.object({
  lineItems: z.array(lineItemSchema).optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  dueAt: z.string().datetime().or(z.string()).optional(),
  notes: z.string().optional(),
});

export const issueInvoiceSchema = z.object({
  dueAt: z.string().datetime().or(z.string()).optional(),
  notes: z.string().optional(),
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().min(3, "Cancellation reason must be at least 3 characters"),
});

export const financialAdjustmentSchema = z.object({
  type: z.nativeEnum(AdjustmentType),
  amount: z.number().positive("Adjustment amount must be strictly greater than 0"),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
});

export const listInvoicesQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  clientId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  isOverdue: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  minAmount: z.string().transform(Number).optional(),
  maxAmount: z.string().transform(Number).optional(),
});
