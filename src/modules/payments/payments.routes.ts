import { Router } from "express";
import { paymentController } from "./payments.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody, validateQuery } from "../../common/middleware/validate.js";
import {
  initiateMpesaPaymentSchema,
  recordManualPaymentSchema,
  reversePaymentSchema,
  listTransactionsQuerySchema,
} from "./payments.schema.js";
import { UserRole } from "@prisma/client";

// Public Webhook Routes (no auth): /api/v1/payments/callbacks/mpesa & /api/v1/payments/mpesa/callback
export const paymentCallbackRoutes = Router();
paymentCallbackRoutes.post("/callbacks/mpesa", paymentController.handleMpesaCallback.bind(paymentController));
paymentCallbackRoutes.post("/mpesa/callback", paymentController.handleMpesaCallback.bind(paymentController));

// Client Payment routes: /api/v1/client/payments & /api/v1/payments
export const clientPaymentRoutes = Router();
clientPaymentRoutes.use(authenticateToken, requireRole([UserRole.CLIENT]));

clientPaymentRoutes.post(
  "/mpesa/stkpush",
  validateBody(initiateMpesaPaymentSchema),
  paymentController.initiateMpesaPayment.bind(paymentController)
);

clientPaymentRoutes.get(
  "/",
  validateQuery(listTransactionsQuerySchema),
  paymentController.listClientTransactions.bind(paymentController)
);

clientPaymentRoutes.get(
  "/transactions",
  validateQuery(listTransactionsQuerySchema),
  paymentController.listClientTransactions.bind(paymentController)
);

clientPaymentRoutes.get(
  "/transactions/:id",
  paymentController.getClientTransactionById.bind(paymentController)
);

clientPaymentRoutes.get(
  "/:id",
  paymentController.getClientTransactionById.bind(paymentController)
);

// Admin Payment routes: /api/v1/admin/payments
export const adminPaymentRoutes = Router();
adminPaymentRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

adminPaymentRoutes.post(
  "/record",
  validateBody(recordManualPaymentSchema),
  paymentController.recordManualPayment.bind(paymentController)
);

adminPaymentRoutes.post(
  "/manual",
  validateBody(recordManualPaymentSchema),
  paymentController.recordManualPayment.bind(paymentController)
);

adminPaymentRoutes.get(
  "/",
  validateQuery(listTransactionsQuerySchema),
  paymentController.listAdminTransactions.bind(paymentController)
);

adminPaymentRoutes.get(
  "/transactions",
  validateQuery(listTransactionsQuerySchema),
  paymentController.listAdminTransactions.bind(paymentController)
);

adminPaymentRoutes.get(
  "/transactions/:id",
  paymentController.getAdminTransactionById.bind(paymentController)
);

adminPaymentRoutes.get(
  "/:id",
  paymentController.getAdminTransactionById.bind(paymentController)
);

adminPaymentRoutes.post(
  "/transactions/:id/reverse",
  validateBody(reversePaymentSchema),
  paymentController.reversePayment.bind(paymentController)
);

adminPaymentRoutes.post(
  "/:id/reverse",
  validateBody(reversePaymentSchema),
  paymentController.reversePayment.bind(paymentController)
);

adminPaymentRoutes.post(
  "/transactions/:id/refund",
  paymentController.requestPaymentRefund.bind(paymentController)
);

adminPaymentRoutes.post(
  "/:id/refund",
  paymentController.requestPaymentRefund.bind(paymentController)
);

export const paymentRoutes = clientPaymentRoutes;

