import { Router } from "express";
import { applicationController } from "./applications.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  createClientApplicationSchema,
  createAdminApplicationSchema,
  updateApplicationStatusSchema,
  updateApplicationPrioritySchema,
  closeApplicationSchema,
  assignApplicationSchema,
  unassignApplicationSchema,
  createApplicationNoteSchema,
  submitRequirementSchema,
  reviewRequirementSchema,
  listApplicationsQuerySchema,
  workloadQueueQuerySchema,
  workQueueQuerySchema,
} from "./applications.schema.js";
import { UserRole } from "@prisma/client";

// Client Routes: /api/v1/client/applications
export const clientApplicationRoutes = Router();
clientApplicationRoutes.use(authenticate, requireClientAccess);
clientApplicationRoutes.get("/", validate({ query: listApplicationsQuerySchema }), applicationController.listClientApplications);
clientApplicationRoutes.post("/", validate({ body: createClientApplicationSchema }), applicationController.createClientApplication);
clientApplicationRoutes.get("/:id", applicationController.getApplicationDetails);
clientApplicationRoutes.get("/:id/readiness", applicationController.getReadiness);
clientApplicationRoutes.post("/:id/requirements/:requirementId", validate({ body: submitRequirementSchema }), applicationController.submitRequirement);
clientApplicationRoutes.get("/:id/requirements/:requirementId/history", applicationController.getRequirementHistory);

// Admin Routes: /api/v1/admin/applications
export const adminApplicationRoutes = Router();
adminApplicationRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminApplicationRoutes.get("/", validate({ query: listApplicationsQuerySchema }), applicationController.listAdminApplications);
adminApplicationRoutes.get("/work-queue", validate({ query: workQueueQuerySchema }), applicationController.getComprehensiveWorkQueue);
adminApplicationRoutes.get("/queues", validate({ query: workloadQueueQuerySchema }), applicationController.getWorkloadQueues);
adminApplicationRoutes.get("/workload-queues", validate({ query: workloadQueueQuerySchema }), applicationController.getWorkloadQueues);
adminApplicationRoutes.post("/", validate({ body: createAdminApplicationSchema }), applicationController.createAdminApplication);
adminApplicationRoutes.get("/:id", applicationController.getApplicationDetails);
adminApplicationRoutes.get("/:id/readiness", applicationController.getReadiness);
adminApplicationRoutes.patch("/:id/status", validate({ body: updateApplicationStatusSchema }), applicationController.transitionStatus);
adminApplicationRoutes.patch("/:id/priority", validate({ body: updateApplicationPrioritySchema }), applicationController.updatePriority);
adminApplicationRoutes.post("/:id/close", validate({ body: closeApplicationSchema }), applicationController.closeApplication);
adminApplicationRoutes.patch("/:id/assign", validate({ body: assignApplicationSchema }), applicationController.assignAdmin);
adminApplicationRoutes.patch("/:id/unassign", validate({ body: unassignApplicationSchema }), applicationController.unassignAdmin);
adminApplicationRoutes.patch("/:id/requirements/:requirementId/review", validate({ body: reviewRequirementSchema }), applicationController.reviewRequirement);
adminApplicationRoutes.post("/:id/requirements/:requirementId/review", validate({ body: reviewRequirementSchema }), applicationController.reviewRequirement);
adminApplicationRoutes.get("/:id/requirements/:requirementId/history", applicationController.getRequirementHistory);
adminApplicationRoutes.post("/:id/notes", validate({ body: createApplicationNoteSchema }), applicationController.addNote);
