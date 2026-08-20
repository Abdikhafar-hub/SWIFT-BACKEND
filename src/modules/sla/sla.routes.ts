import { Router } from "express";
import { slaController } from "./sla.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody } from "../../common/middleware/validate.js";
import { pauseSlaSchema, resumeSlaSchema } from "./sla.schema.js";
import { UserRole } from "@prisma/client";

const router = Router();

// SLA Sweep
router.post(
  "/admin/sla/sweep",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  slaController.triggerSweep
);

// SLA Metrics
router.get(
  "/admin/sla/metrics",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  slaController.getMetrics
);

// Pause SLA on an application
router.post(
  "/admin/applications/:id/sla/pause",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(pauseSlaSchema),
  slaController.pauseSla
);

// Resume SLA on an application
router.post(
  "/admin/applications/:id/sla/resume",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(resumeSlaSchema),
  slaController.resumeSla
);

// Get SLA timeline & breakdown for an application
router.get(
  "/applications/:id/sla-timeline",
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  slaController.getTimeline
);

export const slaRouter = router;
export const adminSlaRoutes = router;
export const clientSlaRoutes = router;
