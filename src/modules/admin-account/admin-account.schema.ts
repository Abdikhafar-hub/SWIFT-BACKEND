import { z } from "zod";

export const updateAdminProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name cannot be empty").max(60).optional(),
  lastName: z.string().trim().min(1, "Last name cannot be empty").max(60).optional(),
  phone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
});

export const uploadProfileImageSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().refine((type) => ["image/jpeg", "image/png", "image/webp"].includes(type), {
    message: "Only JPEG, PNG, and WebP images are allowed",
  }),
  base64Data: z.string().min(1, "Image content (base64) is required"),
});

export const changeAdminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters long"),
    confirmNewPassword: z.string().min(8, "Confirmation password is required"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New password and confirmation password do not match",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export const requestEmailChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: z.string().email("Please enter a valid email address").trim().toLowerCase(),
});

export const verifyEmailChangeSchema = z.object({
  code: z.string().length(6, "Verification code must be exactly 6 digits"),
});

export const updateNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  emailOperationalAlerts: z.boolean().optional(),
  emailClientRegistrations: z.boolean().optional(),
  emailApplicationAlerts: z.boolean().optional(),
  emailPaymentNotifications: z.boolean().optional(),
  emailClientActions: z.boolean().optional(),
  emailSlaAlerts: z.boolean().optional(),
  emailSecurityNotifications: z.boolean().optional(),
  inAppOperationalAlerts: z.boolean().optional(),
  inAppAssignments: z.boolean().optional(),
  inAppClientActions: z.boolean().optional(),
  inAppSlaAlerts: z.boolean().optional(),
});

export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;
export type UploadProfileImageInput = z.infer<typeof uploadProfileImageSchema>;
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
