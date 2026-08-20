import { Response, NextFunction } from "express";
import { qualityCheckService } from "./quality.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class QualityController {
  async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const status = await qualityCheckService.getQualityCheckStatus(applicationId, req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  async performCheck(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const result = await qualityCheckService.performQualityCheck({
        applicationId,
        organizationId: req.user!.organizationId,
        reviewerId: req.user!.id,
        reviewerEmail: req.user!.email,
        result: req.body.result,
        checklist: req.body.checklist,
        notes: req.body.notes,
        failedReason: req.body.failedReason,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const qualityController = new QualityController();
