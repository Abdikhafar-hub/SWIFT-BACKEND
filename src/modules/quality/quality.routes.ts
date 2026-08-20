import { Router } from "express";
import { qualityController } from "./quality.controller.js";
import { authenticate, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { performQualityCheckSchema } from "./quality.schema.js";
import { UserRole } from "@prisma/client";

export const adminQualityRoutes = Router();
adminQualityRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminQualityRoutes.get("/applications/:id/status", qualityController.getStatus);
adminQualityRoutes.post(
  "/applications/:id",
  validate({ body: performQualityCheckSchema }),
  qualityController.performCheck
);
