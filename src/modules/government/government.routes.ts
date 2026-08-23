import { Router } from "express";
import { governmentController } from "./government.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  createGovernmentRecordSchema,
  updateGovernmentStatusSchema,
  scheduleGovernmentFollowUpSchema,
  recordGovernmentFollowUpSchema,
  recordGovernmentQuerySchema,
  recordGovernmentPaymentSchema,
  scheduleGovernmentAppointmentSchema,
  recordExternalUpdateSchema,
  uploadGovernmentEvidenceSchema,
  assignGovernmentCaseSchema,
  addGovernmentReferenceSchema,
  governmentQueueQuerySchema,
} from "./government.schema.js";
import { UserRole } from "@prisma/client";

const router = Router();
const roleMiddleware = requireRole(UserRole.ADMIN);

// CLIENT ROUTES
router.get(
  ["/applications/:id/government-tracking", "/client/applications/:id/government"],
  authenticateToken,
  requireRole(UserRole.CLIENT, UserRole.ADMIN),
  governmentController.getClientTracking
);

// ADMIN METRICS & READINESS
router.get(
  ["/admin/government/kpis", "/admin/government-kpis"],
  authenticateToken,
  roleMiddleware,
  governmentController.getDashboardKpis
);

router.get(
  ["/admin/government/ready-applications", "/admin/government-ready-apps"],
  authenticateToken,
  roleMiddleware,
  governmentController.getReadyApplications
);

// ADMIN WORK QUEUE & SUBMISSIONS
router.get(
  ["/admin/government-applications/queue", "/admin/government/queue", "/admin/government/submissions"],
  authenticateToken,
  roleMiddleware,
  validateQuery(governmentQueueQuerySchema),
  governmentController.getGovernmentQueue
);

router.post(
  ["/admin/government/submissions", "/admin/government-applications/submissions"],
  authenticateToken,
  roleMiddleware,
  validateBody(createGovernmentRecordSchema),
  governmentController.createSubmission
);

router.post(
  ["/admin/applications/:id/government", "/admin/government/applications/:id"],
  authenticateToken,
  roleMiddleware,
  validateBody(createGovernmentRecordSchema),
  governmentController.createSubmission
);

// DOSSIER & ACTIONS
router.get(
  ["/admin/government/submissions/:id", "/admin/government/:id"],
  authenticateToken,
  roleMiddleware,
  governmentController.getDossier
);

router.patch(
  ["/admin/government-applications/:id/status", "/admin/government/:id/status", "/admin/government/submissions/:id/status"],
  authenticateToken,
  roleMiddleware,
  validateBody(updateGovernmentStatusSchema),
  governmentController.updateStatus
);

router.post(
  ["/admin/government/submissions/:id/query", "/admin/government/:id/query"],
  authenticateToken,
  roleMiddleware,
  validateBody(recordGovernmentQuerySchema),
  governmentController.recordQuery
);

router.post(
  ["/admin/government/submissions/:id/payment", "/admin/government/:id/payment"],
  authenticateToken,
  roleMiddleware,
  validateBody(recordGovernmentPaymentSchema),
  governmentController.recordPayment
);

router.post(
  ["/admin/government/submissions/:id/appointment", "/admin/government/:id/appointment"],
  authenticateToken,
  roleMiddleware,
  validateBody(scheduleGovernmentAppointmentSchema),
  governmentController.scheduleAppointment
);

router.post(
  ["/admin/government/submissions/:id/follow-up", "/admin/government/:id/follow-up"],
  authenticateToken,
  roleMiddleware,
  validateBody(recordGovernmentFollowUpSchema),
  governmentController.recordFollowUp
);

router.post(
  ["/admin/government/submissions/:id/external-update", "/admin/government/:id/external-update"],
  authenticateToken,
  roleMiddleware,
  validateBody(recordExternalUpdateSchema),
  governmentController.recordExternalUpdate
);

router.post(
  ["/admin/government/submissions/:id/evidence", "/admin/government/:id/evidence"],
  authenticateToken,
  roleMiddleware,
  validateBody(uploadGovernmentEvidenceSchema),
  governmentController.uploadEvidence
);

router.post(
  ["/admin/government/submissions/:id/assign", "/admin/government/:id/assign"],
  authenticateToken,
  roleMiddleware,
  validateBody(assignGovernmentCaseSchema),
  governmentController.assignCase
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

router.get(
  ["/admin/government-applications/:id/history", "/admin/government/:id/history"],
  authenticateToken,
  roleMiddleware,
  governmentController.getStatusHistory
);

export const governmentRouter = router;
export const clientGovernmentRoutes = router;
export const adminGovernmentRoutes = router;
