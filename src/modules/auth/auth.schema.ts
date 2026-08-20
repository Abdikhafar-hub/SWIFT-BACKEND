import { z } from "zod";
import { CLIENT_TYPES, COMMUNICATION_CHANNELS } from "../../config/constants.js";

export const registerSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(9, "Phone number must be at least 9 digits"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  clientType: z.enum([CLIENT_TYPES.INDIVIDUAL, CLIENT_TYPES.BUSINESS, CLIENT_TYPES.ORGANIZATION]).default(CLIENT_TYPES.INDIVIDUAL),
  businessName: z.string().optional(),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  kraPin: z.string().optional(),
  address: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  preferredChannel: z.enum([COMMUNICATION_CHANNELS.EMAIL, COMMUNICATION_CHANNELS.SMS, COMMUNICATION_CHANNELS.IN_APP, COMMUNICATION_CHANNELS.WHATSAPP]).default(COMMUNICATION_CHANNELS.EMAIL),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const verifyOtpSchema = z.object({
  code: z.string().min(4, "Verification code is required").max(8),
});


