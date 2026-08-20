import { Router } from "express";
import { refundsController } from "./refunds.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  requestRefundSchema,
  approveRefundSchema,
  rejectRefundSchema,
  listRefundsQuerySchema,
} from "./refunds.schema.js";
import { UserRole } from "@prisma/client";

export const adminRefundRoutes = Router();
adminRefundRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

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
  validateBody(requestRefundSchema),
  refundsController.requestRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/approve",
  validateBody(approveRefundSchema),
  refundsController.approveRefund.bind(refundsController)
);

adminRefundRoutes.post(
  "/:id/reject",
  validateBody(rejectRefundSchema),
  refundsController.rejectRefund.bind(refundsController)
);

export default adminRefundRoutes;

