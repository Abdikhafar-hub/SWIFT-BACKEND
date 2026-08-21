import { Router } from "express";
import { adminAccountController } from "./admin-account.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody } from "../../common/middleware/validate.js";
import { UserRole } from "@prisma/client";
import {
  updateAdminProfileSchema,
  uploadProfileImageSchema,
  changeAdminPasswordSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
  updateNotificationPreferencesSchema,
} from "./admin-account.schema.js";

const router = Router();

// Apply auth + ADMIN role check to all routes in this module
router.use(authenticateToken);
router.use(requireRole(UserRole.ADMIN));

// Profile Endpoints
router.get("/profile", adminAccountController.getProfile);
router.patch("/profile", validateBody(updateAdminProfileSchema), adminAccountController.updateProfile);

// Profile Photo Endpoints
router.post("/profile-image", validateBody(uploadProfileImageSchema), adminAccountController.uploadProfileImage);
router.delete("/profile-image", adminAccountController.deleteProfileImage);

// Password Management Endpoint
router.post("/change-password", validateBody(changeAdminPasswordSchema), adminAccountController.changePassword);

// Email Change Workflow Endpoints
router.post("/request-email-change", validateBody(requestEmailChangeSchema), adminAccountController.requestEmailChange);
router.post("/verify-email-change", validateBody(verifyEmailChangeSchema), adminAccountController.verifyEmailChange);

// Notification Preferences Endpoints
router.get("/notification-preferences", adminAccountController.getNotificationPreferences);
router.patch(
  "/notification-preferences",
  validateBody(updateNotificationPreferencesSchema),
  adminAccountController.updateNotificationPreferences
);

export const adminAccountRoutes = router;
