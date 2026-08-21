import { Response, NextFunction } from "express";
import { qualityCheckService } from "./quality.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class QualityController {
  async getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await qualityCheckService.getQualityMetrics(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await qualityCheckService.getQualityQueue(req.user!.organizationId, req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getEligibleApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const list = await qualityCheckService.getEligibleApplications(req.user!.organizationId, search);
      res.status(200).json({
        success: true,
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  async startInspection(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await qualityCheckService.startInspection({
        organizationId: req.user!.organizationId,
        applicationId: req.body.applicationId,
        reviewerId: req.user!.id,
        reviewerEmail: req.user!.email,
        assignedReviewerId: req.body.reviewerId,
        priority: req.body.priority,
        notes: req.body.notes,
      });
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const workspace = await qualityCheckService.getQcWorkspace(applicationId, req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      next(error);
    }
  }

  async reviewItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const result = await qualityCheckService.reviewItem({
        organizationId: req.user!.organizationId,
        applicationId,
        requirementId: req.body.requirementId,
        documentId: req.body.documentId,
        reviewerId: req.user!.id,
        reviewerEmail: req.user!.email,
        action: req.body.action,
        deficiencyCategory: req.body.deficiencyCategory,
        reviewerFeedback: req.body.reviewerFeedback,
        notes: req.body.notes,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async submitDecision(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const result = await qualityCheckService.submitDecision({
        organizationId: req.user!.organizationId,
        applicationId,
        reviewerId: req.user!.id,
        reviewerEmail: req.user!.email,
        decision: req.body.decision,
        checklist: req.body.checklist,
        notes: req.body.notes,
        failedReason: req.body.failedReason,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

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
