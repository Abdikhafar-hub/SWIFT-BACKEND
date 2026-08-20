import { Router } from "express";
import { serviceCatalogController } from "./services.controller.js";
import { authenticate, optionalAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { createServiceSchema, updateServiceSchema } from "./services.schema.js";
import { UserRole } from "@prisma/client";

// Public / Client Services: /api/v1/client/services or /api/v1/services
export const clientServiceRoutes = Router();
clientServiceRoutes.get("/", optionalAuth, serviceCatalogController.listPublicServices);
clientServiceRoutes.get("/:slug", optionalAuth, serviceCatalogController.getServiceBySlug);

// Admin Services: /api/v1/admin/services
export const adminServiceRoutes = Router();
adminServiceRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminServiceRoutes.get("/", serviceCatalogController.listAdminServices);
adminServiceRoutes.post("/", validate({ body: createServiceSchema }), serviceCatalogController.createService);
adminServiceRoutes.patch("/:id", validate({ body: updateServiceSchema }), serviceCatalogController.updateService);
