import { z } from "zod";

export const deliveryMethods = [
  "DIGITAL",
  "PHYSICAL",
  "BOTH",
] as const;

export const createDeliverySchema = z.object({
  applicationId: z.string().optional().or(z.literal("")),
  clientId: z.string().optional().or(z.literal("")),
  deliveryType: z.string().optional(),
  priority: z.string().optional(),
  deliveryMethod: z.enum(deliveryMethods).default("PHYSICAL"),
  recipientName: z.string().min(2, "Recipient name is required"),
  recipientPhone: z.string().min(5, "Recipient phone is required"),
  recipientEmail: z.string().email().optional().or(z.literal("")),
  physicalAddress: z.string().optional().or(z.literal("")),
  cityCounty: z.string().optional(),
  postalCode: z.string().optional(),
  deliveryInstructions: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  dispatchMethod: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  dispatchDate: z.string().optional(),
  documents: z.array(z.any()).optional(),
  specialInstructions: z.string().optional(),
  internalNotes: z.string().optional(),
  notes: z.string().optional(),
});

export const dispatchDeliveryActionSchema = z.object({
  dispatchDate: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  handoverReference: z.string().optional(),
  notes: z.string().optional(),
});

export const confirmDeliverySchema = z.object({
  deliveredAt: z.string().optional(),
  receivedBy: z.string().optional(),
  recipientPhone: z.string().optional(),
  proofDocumentUrl: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

export const failDeliverySchema = z.object({
  failureReason: z.string().min(1, "Failure reason is required"),
  notes: z.string().optional(),
  nextAction: z.string().optional(),
});
