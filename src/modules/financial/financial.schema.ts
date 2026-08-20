import { z } from "zod";

export const financialSummaryQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const outstandingInvoicesQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  agingBucket: z.enum(["1-7", "8-14", "15-30", "30+"]).optional(),
});
