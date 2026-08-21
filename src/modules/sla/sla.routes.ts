import { Router } from "express";
import { slaController } from "./sla.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  pauseSlaSchema,
  resumeSlaSchema,
  createManualSlaSchema,
  updateSlaSchema,
  slaQuerySchema,
  recalculateSlaSchema,
  completeSlaSchema,
} from "./sla.schema.js";
import { UserRole } from "@prisma/client";

const router = Router();

// SLA Sweep / Evaluation
router.post(
  "/admin/sla/sweep",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  slaController.triggerSweep
);

router.post(
  "/admin/sla/evaluate",
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

// SLA Records Listing
router.get(
  "/admin/sla",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateQuery(slaQuerySchema),
  slaController.getSlaRecords
);

// Create Manual SLA Entry
router.post(
  "/admin/sla",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(createManualSlaSchema),
  slaController.createManualSla
);

// Update SLA Record Parameters
router.patch(
  "/admin/sla/:id",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(updateSlaSchema),
  slaController.updateSla
);

// Force Recalculate SLA State
router.post(
  "/admin/sla/:id/recalculate",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(recalculateSlaSchema),
  slaController.recalculateSla
);

// Mark SLA Complete
router.post(
  "/admin/sla/:id/complete",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(completeSlaSchema),
  slaController.completeSla
);

// Pause SLA on an application
router.post(
  "/admin/applications/:id/sla/pause",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(pauseSlaSchema),
  slaController.pauseSla
);

router.post(
  "/admin/sla/:id/pause",
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

router.post(
  "/admin/sla/:id/resume",
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

router.get(
  "/admin/sla/:id/history",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  slaController.getTimeline
);

export const slaRouter = router;
export const adminSlaRoutes = router;
export const clientSlaRoutes = router;

