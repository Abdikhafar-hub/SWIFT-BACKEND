import { z } from "zod";
import { REQUIREMENT_TYPES } from "../../config/constants.js";

export const requirementSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  type: z.enum([
    REQUIREMENT_TYPES.DOCUMENT,
    REQUIREMENT_TYPES.TEXT,
    REQUIREMENT_TYPES.NUMBER,
    REQUIREMENT_TYPES.DATE,
    REQUIREMENT_TYPES.BOOLEAN,
    REQUIREMENT_TYPES.SELECT,
    REQUIREMENT_TYPES.MULTI_SELECT,
  ]).default(REQUIREMENT_TYPES.DOCUMENT),
  required: z.boolean().default(true),
  options: z.any().optional().nullable(),
  fileTypes: z.array(z.string()).optional().nullable(),
  maxFileSizeMb: z.number().default(10),
  displayOrder: z.number().default(0),
});

export const createServiceSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID"),
  code: z.string().min(2),
  slug: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  active: z.boolean().default(true),
  publiclyVisible: z.boolean().default(true),
  estimatedDuration: z.string().optional().nullable(),
  slaHours: z.number().default(72),
  requiresGovernmentProcess: z.boolean().default(true),
  requiresDocumentReview: z.boolean().default(true),
  requiresPayment: z.boolean().default(true),
  governmentFee: z.number().default(0),
  serviceFee: z.number().default(0),
  requirements: z.array(requirementSchema).default([]),
});

export const updateServiceSchema = createServiceSchema.partial();
