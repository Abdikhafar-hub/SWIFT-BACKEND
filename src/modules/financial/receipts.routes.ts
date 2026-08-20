import { Router } from "express";
import { receiptsController } from "./receipts.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { UserRole } from "@prisma/client";

// ==========================================
// CLIENT RECEIPTS ROUTER (/api/v1/client/receipts)
// ==========================================
export const clientReceiptsRoutes = Router();
clientReceiptsRoutes.use(authenticateToken, requireRole([UserRole.CLIENT]));

clientReceiptsRoutes.get(
  "/",
  receiptsController.listClientReceipts.bind(receiptsController)
);

clientReceiptsRoutes.get(
  "/:id",
  receiptsController.getClientReceiptById.bind(receiptsController)
);

// ==========================================
// ADMIN RECEIPTS ROUTER (/api/v1/admin/receipts)
// ==========================================
export const adminReceiptsRoutes = Router();
adminReceiptsRoutes.use(authenticateToken, requireRole([UserRole.ADMIN]));

adminReceiptsRoutes.get(
  "/",
  receiptsController.listAdminReceipts.bind(receiptsController)
);

adminReceiptsRoutes.get(
  "/:id",
  receiptsController.getAdminReceiptById.bind(receiptsController)
);

export default adminReceiptsRoutes;

