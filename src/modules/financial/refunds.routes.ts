import { Router } from "express";
import { refundsController } from "./refunds.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  initiateRefundSchema,
  approveRefundSchema,
  processRefundSchema,
  completeRefundSchema,
  rejectRefundSchema,
  cancelRefundSchema,
  listRefundsQuerySchema,
} from "./refunds.schema.js";
import { UserRole } from "@prisma/client";

export const adminRefundRoutes = Router();
adminRefundRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

adminRefundRoutes.get(
  "/eligible-sources",
  refundsController.getEligibleFinancialSources.bind(refundsController)
);

adminRefundRoutes.get(
  "/",
  validateQuery(listRefundsQuerySchema),
  refundsController.listAdminRefunds.bind(refundsController)
);

adminRefundRoutes.get(
  "/:id",
  refundsController.getAdminRefundById.bind(refundsController)
);

adminRefundRoutes.post(
  "/",
  validateBody(initiateRefundSchema),
  refundsController.initiateRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/approve",
  validateBody(approveRefundSchema),
  refundsController.approveRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/process",
  validateBody(processRefundSchema),
  refundsController.processRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/complete",
  validateBody(completeRefundSchema),
  refundsController.completeRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/reject",
  validateBody(rejectRefundSchema),
  refundsController.rejectRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/cancel",
  validateBody(cancelRefundSchema),
  refundsController.cancelRefund.bind(refundsController)
);

export default adminRefundRoutes;
