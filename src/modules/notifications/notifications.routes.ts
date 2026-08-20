import { Router } from "express";
import { notificationController } from "./notifications.controller.js";
import { authenticateToken } from "../../common/middleware/auth.js";
import { validateBody } from "../../common/middleware/validate.js";
import { updateNotificationPreferencesSchema } from "./notifications.schema.js";

const router = Router();

// User Notifications
router.get("/", authenticateToken, notificationController.listNotifications);
router.get("/notifications", authenticateToken, notificationController.listNotifications);
router.patch("/:id/read", authenticateToken, notificationController.markAsRead);
router.patch("/notifications/:id/read", authenticateToken, notificationController.markAsRead);
router.post("/read-all", authenticateToken, notificationController.markAllAsRead);
router.post("/notifications/read-all", authenticateToken, notificationController.markAllAsRead);

// User Notification Preferences
router.get("/preferences", authenticateToken, notificationController.getPreferences);
router.get("/notifications/preferences", authenticateToken, notificationController.getPreferences);
router.patch(
  "/preferences",
  authenticateToken,
  validateBody(updateNotificationPreferencesSchema),
  notificationController.updatePreferences
);
router.patch(
  "/notifications/preferences",
  authenticateToken,
  validateBody(updateNotificationPreferencesSchema),
  notificationController.updatePreferences
);

export const notificationRouter = router;
export const notificationRoutes = router;
