import { Response, NextFunction } from "express";
import { dashboardsService } from "./dashboards.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class DashboardsController {
  async getAdminDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardsService.getAdminOverview(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClientDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardsService.getClientOverview(
        req.user!.organizationId,
        req.user!.clientId!
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardsController = new DashboardsController();
