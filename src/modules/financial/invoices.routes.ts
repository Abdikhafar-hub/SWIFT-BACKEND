import { Router } from "express";
import { invoicesController } from "./invoices.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  createInvoiceSchema,
  updateDraftInvoiceSchema,
  issueInvoiceSchema,
  cancelInvoiceSchema,
  financialAdjustmentSchema,
  listInvoicesQuerySchema,
} from "./invoices.schema.js";
import { UserRole } from "@prisma/client";

// ==========================================
// CLIENT INVOICES ROUTER (/api/v1/client/invoices)
// ==========================================
export const clientInvoicesRoutes = Router();
clientInvoicesRoutes.use(authenticateToken, requireRole([UserRole.CLIENT]));

clientInvoicesRoutes.get(
  "/",
  validateQuery(listInvoicesQuerySchema),
  invoicesController.listClientInvoices.bind(invoicesController)
);

clientInvoicesRoutes.get(
  "/:id",
  invoicesController.getClientInvoiceById.bind(invoicesController)
);

clientInvoicesRoutes.get(
  "/:id/transactions",
  invoicesController.getClientInvoiceTransactions.bind(invoicesController)
);

clientInvoicesRoutes.post(
  "/:id/pay-mpesa",
  invoicesController.payInvoiceMpesa.bind(invoicesController)
);

clientInvoicesRoutes.post(
  "/:id/pay/mpesa",
  invoicesController.payInvoiceMpesa.bind(invoicesController)
);

clientInvoicesRoutes.get(
  "/:id/status",
  invoicesController.getInvoiceStatus.bind(invoicesController)
);

// ==========================================
// ADMIN INVOICES ROUTER (/api/v1/admin/invoices)
// ==========================================
export const adminInvoicesRoutes = Router();
adminInvoicesRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

adminInvoicesRoutes.get(
  "/",
  validateQuery(listInvoicesQuerySchema),
  invoicesController.listAdminInvoices.bind(invoicesController)
);

adminInvoicesRoutes.get(
  "/:id",
  invoicesController.getAdminInvoiceById.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/",
  validateBody(createInvoiceSchema),
  invoicesController.createInvoice.bind(invoicesController)
);

adminInvoicesRoutes.patch(
  "/:id",
  validateBody(updateDraftInvoiceSchema),
  invoicesController.updateDraftInvoice.bind(invoicesController)
);

adminInvoicesRoutes.put(
  "/:id/draft",
  validateBody(updateDraftInvoiceSchema),
  invoicesController.updateDraftInvoice.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/issue",
  validateBody(issueInvoiceSchema),
  invoicesController.issueInvoice.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/send",
  invoicesController.resendNotification.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/resend",
  invoicesController.resendNotification.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/cancel",
  validateBody(cancelInvoiceSchema),
  invoicesController.cancelInvoice.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/adjust",
  validateBody(financialAdjustmentSchema),
  invoicesController.applyAdjustment.bind(invoicesController)
);

adminInvoicesRoutes.post(
  "/:id/adjustments",
  validateBody(financialAdjustmentSchema),
  invoicesController.applyAdjustment.bind(invoicesController)
);

adminInvoicesRoutes.get(
  "/:id/status",
  invoicesController.getInvoiceStatus.bind(invoicesController)
);

export default adminInvoicesRoutes;

