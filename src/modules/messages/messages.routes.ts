import { Router } from "express";
import { applicationMessageController } from "./messages.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { sendMessageSchema } from "./messages.schema.js";
import { UserRole } from "@prisma/client";

// Client message routes: /api/v1/client/messages
export const clientMessageRoutes = Router();
clientMessageRoutes.use(authenticate, requireClientAccess);

// Thread list endpoint
clientMessageRoutes.get("/threads", applicationMessageController.getClientThreads);

// Direct compose message endpoint
clientMessageRoutes.post("/send", validate({ body: sendMessageSchema }), applicationMessageController.sendClientMessage);

// Application-specific thread routes
clientMessageRoutes.post("/:id/messages", validate({ body: sendMessageSchema }), applicationMessageController.sendClientMessage);
clientMessageRoutes.get("/:id/messages", applicationMessageController.getClientMessages);
clientMessageRoutes.post("/:applicationId/messages/:messageId/star", applicationMessageController.toggleStar);


// Admin message routes: /api/v1/admin/messages
export const adminMessageRoutes = Router();
adminMessageRoutes.use(authenticate, requireRole(UserRole.ADMIN));

// Thread list endpoint
adminMessageRoutes.get("/threads", applicationMessageController.getAdminThreads);

// Direct compose message endpoint
adminMessageRoutes.post("/send", validate({ body: sendMessageSchema }), applicationMessageController.sendAdminMessage);

// Application-specific thread routes
adminMessageRoutes.post("/:id/messages", validate({ body: sendMessageSchema }), applicationMessageController.sendAdminMessage);
adminMessageRoutes.get("/:id/messages", applicationMessageController.getAdminMessages);
adminMessageRoutes.post("/:applicationId/messages/:messageId/star", applicationMessageController.toggleStar);
