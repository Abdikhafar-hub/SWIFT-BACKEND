import { z } from "zod";

export const pauseSlaSchema = z.object({
  category: z.enum(["CLIENT_WAITING", "GOVERNMENT_WAITING", "INTERNAL"]).default("INTERNAL"),
  reason: z.string().min(3, "Reason for pausing SLA is required"),
});

export const resumeSlaSchema = z.object({
  reason: z.string().optional(),
});

export const slaMetricsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
