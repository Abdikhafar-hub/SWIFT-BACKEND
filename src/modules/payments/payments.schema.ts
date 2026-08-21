import { z } from "zod";
import { PAYMENT_METHODS } from "../../config/constants.js";
import { PaymentStatus, PaymentMethod, TransactionType } from "@prisma/client";

export const initiateMpesaPaymentSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID").optional(),
  invoiceId: z.string().uuid("Invalid invoice ID").optional(),
  phoneNumber: z.string().min(9, "Phone number must be at least 9 digits"),
  amount: z.number().positive("Amount must be greater than 0").optional(),
  idempotencyKey: z.string().min(8, "Idempotency key is required"),
}).refine((data) => data.applicationId || data.invoiceId, {
  message: "Either applicationId or invoiceId must be provided",
});

export const recordManualPaymentSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID").optional(),
  invoiceId: z.string().uuid("Invalid invoice ID").optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  amount: z.number().positive("Amount must be greater than 0"),
  externalReference: z.string().min(2, "External reference/receipt number is required"),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(8, "Idempotency key is required"),
}).refine((data) => data.applicationId || data.invoiceId, {
  message: "Either applicationId or invoiceId must be provided",
});

export const reversePaymentSchema = z.object({
  reason: z.string().min(3, "Reversal reason must be at least 3 characters"),
});

export const listTransactionsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  transactionType: z.nativeEnum(TransactionType).optional(),
  clientId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
