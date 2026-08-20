import { Response, NextFunction } from "express";
import { slaService } from "./sla.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { SlaEventCategory } from "@prisma/client";

export class SlaController {
  // Manual SLA sweep
  async triggerSweep(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await slaService.performSlaSweep(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // SLA metrics
  async getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await slaService.getSlaMetrics(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  // Pause SLA
  async pauseSla(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const app = await slaService.pauseSla(
        applicationId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body.category as SlaEventCategory,
        req.body.reason
      );

      res.status(200).json({
        success: true,
        data: app,
      });
    } catch (error) {
      next(error);
    }
  }

  // Resume SLA
  async resumeSla(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const app = await slaService.resumeSla(
        applicationId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body.reason
      );

      res.status(200).json({
        success: true,
        data: app,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get application SLA timeline and breakdown
  async getTimeline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const breakdown = await slaService.getApplicationSlaTimeline(
        applicationId,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const slaController = new SlaController();
