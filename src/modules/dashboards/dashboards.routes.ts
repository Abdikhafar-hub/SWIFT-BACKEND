import { Router } from "express";
import { dashboardsController } from "./dashboards.controller.js";
import { authenticate, requireClientAccess, requireRole } from "../../common/middleware/auth.js";
import { UserRole } from "@prisma/client";

// Admin Dashboard Routes: /api/v1/admin/dashboard
export const adminDashboardRoutes = Router();
adminDashboardRoutes.use(authenticate, requireRole(UserRole.ADMIN));
adminDashboardRoutes.get("/overview", dashboardsController.getAdminDashboard);

// Client Dashboard Routes: /api/v1/client/dashboard
export const clientDashboardRoutes = Router();
clientDashboardRoutes.use(authenticate, requireClientAccess);
clientDashboardRoutes.get("/overview", dashboardsController.getClientDashboard);
