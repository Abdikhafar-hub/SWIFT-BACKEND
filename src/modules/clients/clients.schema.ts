import { z } from "zod";
import { CLIENT_TYPES, COMMUNICATION_CHANNELS } from "../../config/constants.js";

export const updateClientProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  clientType: z.enum([CLIENT_TYPES.INDIVIDUAL, CLIENT_TYPES.BUSINESS, CLIENT_TYPES.ORGANIZATION]).optional(),
  businessName: z.string().optional().nullable(),
  phone: z.string().min(9).optional(),
  alternatePhone: z.string().optional().nullable(),
  nationality: z.string().optional(),
  nationalId: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  kraPin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalAddress: z.string().optional().nullable(),
  preferredCommunicationChannel: z.enum([COMMUNICATION_CHANNELS.EMAIL, COMMUNICATION_CHANNELS.SMS, COMMUNICATION_CHANNELS.IN_APP, COMMUNICATION_CHANNELS.WHATSAPP]).optional(),
});

export const createAdminClientSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(9, "Phone number must be at least 9 digits"),
  clientType: z.enum([CLIENT_TYPES.INDIVIDUAL, CLIENT_TYPES.BUSINESS, CLIENT_TYPES.ORGANIZATION]).default(CLIENT_TYPES.INDIVIDUAL),
  businessName: z.string().optional().nullable(),
  alternatePhone: z.string().optional().nullable(),
  nationality: z.string().default("Kenyan"),
  nationalId: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  kraPin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalAddress: z.string().optional().nullable(),
  preferredCommunicationChannel: z.enum([COMMUNICATION_CHANNELS.EMAIL, COMMUNICATION_CHANNELS.SMS, COMMUNICATION_CHANNELS.IN_APP, COMMUNICATION_CHANNELS.WHATSAPP]).default(COMMUNICATION_CHANNELS.EMAIL),
});

export const listClientsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  clientType: z.enum([CLIENT_TYPES.INDIVIDUAL, CLIENT_TYPES.BUSINESS, CLIENT_TYPES.ORGANIZATION]).optional(),
  isDuplicateFlagged: z.coerce.boolean().optional(),
  isReviewed: z.coerce.boolean().optional(),
});

export const listRegistrationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  clientType: z.enum([CLIENT_TYPES.INDIVIDUAL, CLIENT_TYPES.BUSINESS, CLIENT_TYPES.ORGANIZATION]).optional(),
  isDuplicateFlagged: z.coerce.boolean().optional(),
  isReviewed: z.coerce.boolean().default(false),
});

export const reviewRegistrationSchema = z.object({
  reviewNotes: z.string().max(1000).optional(),
  isDuplicateFlagged: z.boolean().optional(),
  duplicateReason: z.string().max(500).optional().nullable(),
});

export const uploadClientProfileImageSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().refine((type) => ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/pjpeg"].includes(type.toLowerCase()), {
    message: "Only JPEG, PNG, and WebP images are allowed",
  }),
  base64Data: z.string().min(1, "Image content (base64) is required"),
});

