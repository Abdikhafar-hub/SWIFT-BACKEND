import { Router } from "express";
import { qualityController } from "./quality.controller.js";
import { authenticate, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  performQualityCheckSchema,
  startQcInspectionSchema,
  reviewQcItemSchema,
  qcDecisionSchema,
  qcQueueQuerySchema,
} from "./quality.schema.js";
import { UserRole } from "@prisma/client";

export const adminQualityRoutes = Router();

// Apply auth middleware to all admin quality endpoints
adminQualityRoutes.use(authenticate, requireRole(UserRole.ADMIN));

// Operational QC Endpoints
adminQualityRoutes.get("/metrics", qualityController.getMetrics);
adminQualityRoutes.get("/queue", validate({ query: qcQueueQuerySchema }), qualityController.getQueue);
adminQualityRoutes.get("/eligible-applications", qualityController.getEligibleApplications);

adminQualityRoutes.post(
  "/inspections",
  validate({ body: startQcInspectionSchema }),
  qualityController.startInspection
);

adminQualityRoutes.get("/inspections/:id", qualityController.getWorkspace);

adminQualityRoutes.post(
  "/inspections/:id/item-review",
  validate({ body: reviewQcItemSchema }),
  qualityController.reviewItem
);

adminQualityRoutes.post(
  "/inspections/:id/decision",
  validate({ body: qcDecisionSchema }),
  qualityController.submitDecision
);

// Backward Compatibility Routes
adminQualityRoutes.get("/applications/:id/status", qualityController.getStatus);
adminQualityRoutes.post(
  "/applications/:id",
  validate({ body: performQualityCheckSchema }),
  qualityController.performCheck
);
