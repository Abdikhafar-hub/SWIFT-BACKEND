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
// CLIENT ROUTES
// ==========================================

// Client: List actions (supports ?status=OPEN filter)
router.get(
  "/client/actions",
  authenticateToken,
  requireRole(UserRole.CLIENT),
  clientActionsController.getClientActions
);

// Client: Get all open pending actions for client dashboard (alias)
router.get(
  "/client/actions/open",
  authenticateToken,
  requireRole(UserRole.CLIENT),
  clientActionsController.getMyOpenActions
);

// Client: Get single action details
router.get(
  "/client/actions/:id",
  authenticateToken,
  requireRole(UserRole.CLIENT),
  clientActionsController.getActionById
);

// Client: Resolve/Complete action (canonical alias)
router.post(
  "/client/actions/:id/resolve",
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  validateBody(completeClientActionSchema),
  clientActionsController.completeAction
);

// ==========================================
// SHARED ROUTES
// ==========================================

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

// Admin: Get all client actions queue
router.get(
  "/admin/actions",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  clientActionsController.getAllActionsForAdmin
);

// Admin: Get single client action detail
router.get(
  "/admin/actions/:id",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  clientActionsController.getActionById
);

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

