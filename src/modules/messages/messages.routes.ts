import { Router } from "express";
import { applicationMessageController } from "./messages.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { sendMessageSchema } from "./messages.schema.js";
import { UserRole } from "@prisma/client";

// Client message routes: /api/v1/client/applications/:id/messages
export const clientMessageRoutes = Router();
clientMessageRoutes.use(authenticate, requireClientAccess);
clientMessageRoutes.post("/:id/messages", validate({ body: sendMessageSchema }), applicationMessageController.sendClientMessage);
clientMessageRoutes.get("/:id/messages", applicationMessageController.getClientMessages);

// Admin message routes: /api/v1/admin/applications/:id/messages
export const adminMessageRoutes = Router();
adminMessageRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminMessageRoutes.post("/:id/messages", validate({ body: sendMessageSchema }), applicationMessageController.sendAdminMessage);
adminMessageRoutes.get("/:id/messages", applicationMessageController.getAdminMessages);
