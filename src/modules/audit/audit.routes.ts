import { Router } from "express";
import { auditController } from "./audit.controller.js";
import { authenticate, requireRole } from "../../common/middleware/auth.js";
import { UserRole } from "@prisma/client";

const router = Router();
router.use(authenticate, requireRole(UserRole.ADMIN));

router.get("/summary", auditController.getAuditSummary);
router.get("/", auditController.listAuditLogs);

export const adminAuditRoutes = router;
