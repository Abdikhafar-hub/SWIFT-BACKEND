import { z } from "zod";
import { RefundStatus, PaymentMethod } from "@prisma/client";

export const REFUND_REASON_CATEGORIES = [
  "CLIENT_OVERPAYMENT",
  "DUPLICATE_PAYMENT",
  "SERVICE_CANCELLATION",
  "SERVICE_NOT_DELIVERED",
  "GOVERNMENT_FEE_ADJUSTMENT",
  "INCORRECT_BILLING",
  "FAILED_SERVICE_PROCESSING",
  "GOODWILL_ADJUSTMENT",
  "OTHER",
] as const;

export const initiateRefundSchema = z.object({
  paymentId: z.string().uuid("Invalid payment/invoice ID"),
  transactionId: z.string().uuid("Invalid transaction ID"),
  amount: z.number().positive("Refund amount must be strictly greater than 0"),
  reason: z.string().min(3, "Refund reason must be at least 3 characters"),
  reasonCategory: z.enum(REFUND_REASON_CATEGORIES).optional(),
  refundMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.MPESA),
  recipientPhone: z.string().optional(),
  bankName: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().optional(),
  referenceDetails: z.string().optional(),
  internalNotes: z.string().optional(),
  supportingDocumentUrl: z.string().optional(),
  clientExplanation: z.string().optional(),
});

// Retain alias for backward compatibility
export const requestRefundSchema = initiateRefundSchema;

export const approveRefundSchema = z.object({
  notes: z.string().optional(),
});

export const processRefundSchema = z.object({
  notes: z.string().optional(),
  externalReference: z.string().optional(),
});

export const completeRefundSchema = z.object({
  notes: z.string().optional(),
  externalReference: z.string().optional(),
});

export const rejectRefundSchema = z.object({
  reason: z.string().min(3, "Rejection reason must be at least 3 characters"),
});

export const cancelRefundSchema = z.object({
  reason: z.string().optional(),
});

export const retryRefundSchema = z.object({
  notes: z.string().optional(),
});

export const listRefundsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.nativeEnum(RefundStatus).optional(),
  clientId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  reasonCategory: z.string().optional(),
  refundMethod: z.nativeEnum(PaymentMethod).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});
