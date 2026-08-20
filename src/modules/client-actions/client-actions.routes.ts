import { Router } from "express";
import { clientActionsController } from "./client-actions.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody } from "../../common/middleware/validate.js";
import {
  createClientActionSchema,
  completeClientActionSchema,
  cancelClientActionSchema,
} from "./client-actions.schema.js";
import { UserRole } from "@prisma/client";

const router = Router();

// ==========================================
// CLIENT & ADMIN SHARED ROUTES
// ==========================================

// Client: Get all open pending actions for client dashboard
router.get(
  "/client/actions/open",
  authenticateToken,
  requireRole(UserRole.CLIENT),
  clientActionsController.getMyOpenActions
);

// Get actions for a specific application
router.get(
  "/applications/:applicationId/actions",
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  clientActionsController.getApplicationActions
);

// Complete an action (Client or Admin on client's behalf)
router.post(
  "/actions/:id/complete",
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  validateBody(completeClientActionSchema),
  clientActionsController.completeAction
);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Admin: Create an action item for client
router.post(
  "/admin/applications/:applicationId/actions",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(createClientActionSchema),
  clientActionsController.createAction
);

// Admin: Cancel an action item
router.post(
  "/admin/actions/:id/cancel",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(cancelClientActionSchema),
  clientActionsController.cancelAction
);

export const clientActionsRouter = router;
export const adminClientActionsRoutes = router;
export const clientClientActionsRoutes = router;
