import { Router } from "express";
import { paymentProofController } from "./payment-proof.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { UserRole } from "@prisma/client";

export const clientPaymentProofRoutes = Router();
clientPaymentProofRoutes.use(authenticateToken, requireRole([UserRole.CLIENT]));

// Client submits payment proof for an invoice
clientPaymentProofRoutes.post(
  "/:id/proof",
  paymentProofController.submitPaymentProof.bind(paymentProofController)
);

// Client views payment proof detail
clientPaymentProofRoutes.get(
  "/proofs/:id",
  paymentProofController.getPaymentProofById.bind(paymentProofController)
);

export const adminPaymentProofRoutes = Router();
adminPaymentProofRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

// Admin lists payment proof queue
adminPaymentProofRoutes.get(
  "/",
  paymentProofController.listPaymentProofs.bind(paymentProofController)
);

// Admin gets payment proof detail
adminPaymentProofRoutes.get(
  "/:id",
  paymentProofController.getPaymentProofById.bind(paymentProofController)
);

// Admin approves payment proof
adminPaymentProofRoutes.post(
  "/:id/approve",
  paymentProofController.approvePaymentProof.bind(paymentProofController)
);

// Admin rejects payment proof
adminPaymentProofRoutes.post(
  "/:id/reject",
  paymentProofController.rejectPaymentProof.bind(paymentProofController)
);
