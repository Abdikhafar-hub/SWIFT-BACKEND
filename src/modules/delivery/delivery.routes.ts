import { Router } from "express";
import { deliveryController } from "./delivery.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { createDeliverySchema, confirmDeliverySchema } from "./delivery.schema.js";
import { UserRole } from "@prisma/client";

// Admin Delivery Routes: /api/v1/admin/delivery
export const adminDeliveryRoutes = Router();
adminDeliveryRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminDeliveryRoutes.post(
  "/applications/:id",
  validate({ body: createDeliverySchema }),
  deliveryController.dispatchDelivery
);
adminDeliveryRoutes.patch(
  "/:id/confirm",
  validate({ body: confirmDeliverySchema }),
  deliveryController.confirmDelivery
);

// Client Delivery Routes: /api/v1/client/applications/:id/delivery
export const clientDeliveryRoutes = Router();
clientDeliveryRoutes.use(authenticate, requireClientAccess);
clientDeliveryRoutes.get("/:id/delivery", deliveryController.getClientDeliveries);
