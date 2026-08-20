import { Response, NextFunction } from "express";
import { applicationTimelineService } from "./timeline.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class TimelineController {
  async getClientTimeline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const events = await applicationTimelineService.getClientTimeline(
        applicationId,
        req.user!.organizationId,
        req.user!.clientId!
      );

      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminTimeline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const events = await applicationTimelineService.getAdminTimeline(
        applicationId,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const timelineController = new TimelineController();
