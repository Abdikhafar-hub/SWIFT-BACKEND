import { Router } from "express";
import { timelineController } from "./timeline.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { UserRole } from "@prisma/client";

// Client timeline routes: /api/v1/client/applications/:id/timeline
export const clientTimelineRoutes = Router();
clientTimelineRoutes.use(authenticate, requireClientAccess);
clientTimelineRoutes.get("/:id/timeline", timelineController.getClientTimeline);

// Admin timeline routes: /api/v1/admin/applications/:id/timeline
export const adminTimelineRoutes = Router();
adminTimelineRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminTimelineRoutes.get("/:id/timeline", timelineController.getAdminTimeline);
