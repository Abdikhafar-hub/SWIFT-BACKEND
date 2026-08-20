import { z } from "zod";
import { RefundStatus } from "@prisma/client";

export const requestRefundSchema = z.object({
  paymentId: z.string().uuid("Invalid payment/invoice ID"),
  transactionId: z.string().uuid("Invalid transaction ID"),
  amount: z.number().positive("Refund amount must be strictly greater than 0"),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
});

export const approveRefundSchema = z.object({
  notes: z.string().optional(),
});

export const rejectRefundSchema = z.object({
  reason: z.string().min(3, "Rejection reason must be at least 3 characters"),
});

export const listRefundsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.nativeEnum(RefundStatus).optional(),
  clientId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
