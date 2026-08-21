import { Router } from "express";
import { deliveryController } from "./delivery.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  createDeliverySchema,
  confirmDeliverySchema,
  dispatchDeliveryActionSchema,
  failDeliverySchema,
} from "./delivery.schema.js";
import { UserRole } from "@prisma/client";

// Admin Delivery Routes: /api/v1/admin/delivery
export const adminDeliveryRoutes = Router();
adminDeliveryRoutes.use(authenticate, requireRole(UserRole.ADMIN));

// 1. List all deliveries
adminDeliveryRoutes.get("/", deliveryController.listDeliveries);

// 2. Lodge new delivery
adminDeliveryRoutes.post(
  "/",
  validate({ body: createDeliverySchema }),
  deliveryController.lodgeDelivery
);

// 3. Application-specific legacy dispatch
adminDeliveryRoutes.post(
  "/applications/:id",
  validate({ body: createDeliverySchema }),
  deliveryController.lodgeDelivery
);

// 4. Dispatch delivery
adminDeliveryRoutes.patch(
  "/:id/dispatch",
  validate({ body: dispatchDeliveryActionSchema }),
  deliveryController.dispatchDeliveryAction
);

// 5. Confirm delivery (Mark delivered)
adminDeliveryRoutes.patch(
  "/:id/confirm",
  validate({ body: confirmDeliverySchema }),
  deliveryController.confirmDelivery
);

// 6. Fail / Return delivery
adminDeliveryRoutes.patch(
  "/:id/fail",
  validate({ body: failDeliverySchema }),
  deliveryController.reportFailedDelivery
);

// 7. Get single delivery details
adminDeliveryRoutes.get("/:id", deliveryController.getDeliveryById);

// Client Delivery Routes: /api/v1/client/applications/:id/delivery
export const clientDeliveryRoutes = Router();
clientDeliveryRoutes.use(authenticate, requireClientAccess);
clientDeliveryRoutes.get("/:id/delivery", deliveryController.getClientDeliveries);
