import { Router } from "express";
import { reconciliationController } from "./reconciliation.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  ingestStatementSchema,
  manualResolveSchema,
  listReconciliationQuerySchema,
} from "./reconciliation.schema.js";
import { UserRole } from "@prisma/client";

export const adminReconciliationRoutes = Router();
adminReconciliationRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

adminReconciliationRoutes.get(
  "/metrics",
  reconciliationController.getMetrics.bind(reconciliationController)
);

adminReconciliationRoutes.get(
  "/",
  validateQuery(listReconciliationQuerySchema),
  reconciliationController.listRecords.bind(reconciliationController)
);

adminReconciliationRoutes.get(
  "/:id",
  reconciliationController.getRecordById.bind(reconciliationController)
);

adminReconciliationRoutes.post(
  "/statement",
  validateBody(ingestStatementSchema),
  reconciliationController.ingestStatementEntry.bind(reconciliationController)
);

adminReconciliationRoutes.post(
  "/engine/run",
  reconciliationController.runReconciliationEngine.bind(reconciliationController)
);

adminReconciliationRoutes.post(
  "/:id/resolve",
  validateBody(manualResolveSchema),
  reconciliationController.manualResolve.bind(reconciliationController)
);

export default adminReconciliationRoutes;

