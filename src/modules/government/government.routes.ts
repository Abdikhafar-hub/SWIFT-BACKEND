import { Router } from "express";
import { governmentController } from "./government.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  createGovernmentRecordSchema,
  updateGovernmentStatusSchema,
  scheduleGovernmentFollowUpSchema,
  addGovernmentReferenceSchema,
  requestAdditionalInfoSchema,
  resubmitGovernmentSchema,
  recordGovernmentApprovalSchema,
  governmentQueueQuerySchema,
} from "./government.schema.js";
import { UserRole } from "@prisma/client";

// General Router (absolute paths under /api/v1)
const router = Router();

const roleMiddleware = requireRole(UserRole.ADMIN);

// CLIENT ROUTES
router.get(
  ["/applications/:id/government-tracking", "/client/applications/:id/government"],
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  governmentController.getClientTracking
);

// ADMIN ROUTES
router.get(
  ["/admin/government-applications/queue", "/admin/government/queue"],
  authenticateToken,
  roleMiddleware,
  validateQuery(governmentQueueQuerySchema),
  governmentController.getGovernmentQueue
);

router.post(
  ["/admin/applications/:id/government", "/admin/government/applications/:id"],
  authenticateToken,
  roleMiddleware,
  validateBody(createGovernmentRecordSchema),
  governmentController.createRecord
);

router.patch(
  ["/admin/government-applications/:id/status", "/admin/government/:id/status"],
  authenticateToken,
  roleMiddleware,
  validateBody(updateGovernmentStatusSchema),
  governmentController.updateStatus
);

router.post(
  ["/admin/government-applications/:id/request-info", "/admin/government/:id/request-info"],
  authenticateToken,
  roleMiddleware,
  validateBody(requestAdditionalInfoSchema),
  governmentController.requestAdditionalInfo
);

router.post(
  ["/admin/government-applications/:id/resubmit", "/admin/government/:id/resubmit"],
  authenticateToken,
  roleMiddleware,
  validateBody(resubmitGovernmentSchema),
  governmentController.resubmitGovernment
);

router.post(
  ["/admin/government-applications/:id/approve", "/admin/government/:id/approve"],
  authenticateToken,
  roleMiddleware,
  validateBody(recordGovernmentApprovalSchema),
  governmentController.recordApproval
);

router.post(
  ["/admin/government-applications/:id/references", "/admin/government/:id/references"],
  authenticateToken,
  roleMiddleware,
  validateBody(addGovernmentReferenceSchema),
  governmentController.addReference
);

router.delete(
  ["/admin/government-applications/:id/references/:refId", "/admin/government/:id/references/:refId"],
  authenticateToken,
  roleMiddleware,
  governmentController.removeReference
);

router.post(
  ["/admin/government-applications/:id/schedule-followup", "/admin/government/:id/schedule-followup"],
  authenticateToken,
  roleMiddleware,
  validateBody(scheduleGovernmentFollowUpSchema),
  governmentController.scheduleFollowUp
);

router.get(
  ["/admin/government-applications/:id/history", "/admin/government/:id/history"],
  authenticateToken,
  roleMiddleware,
  governmentController.getStatusHistory
);

export const governmentRouter = router;
export const clientGovernmentRoutes = router;
export const adminGovernmentRoutes = router;
