import { z } from "zod";
import { ReconciliationStatus } from "@prisma/client";

export const ingestStatementSchema = z.object({
  reference: z.string().min(3, "Reference code is required"),
  amount: z.number().positive("Amount must be strictly greater than 0"),
  provider: z.string().default("MPESA"),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const manualResolveSchema = z.object({
  status: z.nativeEnum(ReconciliationStatus).optional().default(ReconciliationStatus.MATCHED),
  transactionId: z.string().optional(),
  matchedTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

export const listReconciliationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.nativeEnum(ReconciliationStatus).optional(),
  provider: z.string().optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
