import { Router } from "express";
import { clientController } from "./clients.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  updateClientProfileSchema,
  uploadClientProfileImageSchema,
  createAdminClientSchema,
  listClientsQuerySchema,
  listRegistrationsQuerySchema,
  reviewRegistrationSchema,
} from "./clients.schema.js";
import { UserRole } from "@prisma/client";

// Client portal routes: /api/v1/client/profile
export const clientProfileRoutes = Router();
clientProfileRoutes.use(authenticate, requireClientAccess);
clientProfileRoutes.get("/", clientController.getProfile);
clientProfileRoutes.patch("/", validate({ body: updateClientProfileSchema }), clientController.updateProfile);
clientProfileRoutes.post("/profile-image", validate({ body: uploadClientProfileImageSchema }), clientController.uploadProfileImage);
clientProfileRoutes.delete("/profile-image", clientController.deleteProfileImage);

// Admin client operations routes: /api/v1/admin/clients
export const adminClientRoutes = Router();
adminClientRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminClientRoutes.get("/", validate({ query: listClientsQuerySchema }), clientController.listClients);
adminClientRoutes.post("/", validate({ body: createAdminClientSchema }), clientController.createAdminClient);
adminClientRoutes.get("/:id", clientController.getAdminClientById);

// Admin registration review routes: /api/v1/admin/registrations
export const adminRegistrationRoutes = Router();
adminRegistrationRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminRegistrationRoutes.get("/", validate({ query: listRegistrationsQuerySchema }), clientController.listRegistrations);
adminRegistrationRoutes.get("/:id", clientController.getRegistrationById);
adminRegistrationRoutes.post("/:id/review", validate({ body: reviewRegistrationSchema }), clientController.reviewRegistration);
adminRegistrationRoutes.patch("/:id/review", validate({ body: reviewRegistrationSchema }), clientController.reviewRegistration);

