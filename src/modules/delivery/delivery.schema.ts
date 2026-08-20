import { z } from "zod";

export const deliveryMethods = [
  "DIGITAL",
  "PHYSICAL",
  "BOTH",
] as const;

export const createDeliverySchema = z.object({
  deliveryMethod: z.enum(deliveryMethods),
  recipientName: z.string().min(2, "Recipient name is required"),
  recipientPhone: z.string().min(5, "Recipient phone is required"),
  recipientEmail: z.string().email().optional().or(z.literal("")),
  digitalDocumentId: z.string().uuid().optional(),
  physicalAddress: z.string().optional(),
  dispatchReference: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  proofDocumentUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export const confirmDeliverySchema = z.object({
  receivedBy: z.string().optional(),
  notes: z.string().optional(),
});
