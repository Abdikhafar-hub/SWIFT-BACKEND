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

export const createManualSlaSchema = z.object({
  applicationId: z.string().uuid("Valid application ID is required"),
  slaType: z.enum(["STANDARD", "PRIORITY", "URGENT", "CUSTOM"]).default("STANDARD"),
  durationValue: z.number().positive("SLA duration must be greater than zero"),
  durationUnit: z.enum(["DAYS", "HOURS", "MINUTES"]).default("HOURS"),
  startedAt: z.string().datetime({ message: "Valid SLA start datetime required" }),
  dueAt: z.string().datetime({ message: "Valid SLA due datetime required" }),
  isManualDueDateOverride: z.boolean().optional().default(false),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  initialSlaState: z.enum(["ON_TRACK", "AT_RISK", "PAUSED", "BREACHED"]).default("ON_TRACK"),
  reason: z.string().min(5, "A manual SLA entry must include an operational reason"),
});

export const updateSlaSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  slaHours: z.number().positive().optional(),
  dueAt: z.string().datetime().optional(),
  reason: z.string().min(5, "An operational reason is required for modifying SLA parameters"),
});

export const slaQuerySchema = z.object({
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(15),
  search: z.string().optional(),
  slaStatus: z.string().optional(),
  priority: z.string().optional(),
  serviceId: z.string().optional(),
  dateRange: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  viewMode: z.enum(["ACTIVE", "HISTORICAL", "ALL"]).optional().default("ALL"),
});

export const recalculateSlaSchema = z.object({
  reason: z.string().optional(),
});

export const completeSlaSchema = z.object({
  reason: z.string().optional(),
});

