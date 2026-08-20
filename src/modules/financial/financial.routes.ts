import { Router } from "express";
import { financialAnalyticsController } from "./financial-analytics.controller.js";
import { adminInvoicesRoutes } from "./invoices.routes.js";
import { adminReceiptsRoutes } from "./receipts.routes.js";
import { adminRefundRoutes } from "./refunds.routes.js";
import { adminReconciliationRoutes } from "./reconciliation.routes.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateQuery } from "../../common/middleware/validate.js";
import {
  financialSummaryQuerySchema,
  outstandingInvoicesQuerySchema,
} from "./financial.schema.js";
import { UserRole } from "@prisma/client";

export const adminFinancialRoutes = Router();

// Mount Sub-domains
adminFinancialRoutes.use("/invoices", adminInvoicesRoutes);
adminFinancialRoutes.use("/receipts", adminReceiptsRoutes);
adminFinancialRoutes.use("/refunds", adminRefundRoutes);
adminFinancialRoutes.use("/reconciliation", adminReconciliationRoutes);

// Analytics & Reports (Admin Only)
adminFinancialRoutes.get(
  "/summary",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  validateQuery(financialSummaryQuerySchema),
  financialAnalyticsController.getSummary.bind(financialAnalyticsController)
);

adminFinancialRoutes.get(
  "/collections",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  financialAnalyticsController.getCollections.bind(financialAnalyticsController)
);

adminFinancialRoutes.get(
  "/outstanding",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  validateQuery(outstandingInvoicesQuerySchema),
  financialAnalyticsController.getOutstanding.bind(financialAnalyticsController)
);

adminFinancialRoutes.get(
  "/overdue",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  financialAnalyticsController.getOverdue.bind(financialAnalyticsController)
);

export default adminFinancialRoutes;

