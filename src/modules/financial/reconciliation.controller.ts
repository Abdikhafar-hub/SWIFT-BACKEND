import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { reconciliationService } from "./reconciliation.service.js";

export class ReconciliationController {
  /**
   * Admin: Get reconciliation metrics dashboard KPI
   */
  async getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await reconciliationService.getReconciliationMetrics(
        req.user!.organizationId
      );
      res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: List reconciliation records
   */
  async listRecords(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await reconciliationService.listReconciliationRecords(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get single reconciliation record
   */
  async getRecordById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const record = await reconciliationService.getReconciliationRecordById(
        String(req.params.id),
        req.user!.organizationId
      );
      res.status(200).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Ingest external statement entry
   */
  async ingestStatementEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const record = await reconciliationService.recordStatementEntry(
        req.body,
        req.user!.organizationId
      );
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Run automated reconciliation matching engine
   */
  async runReconciliationEngine(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await reconciliationService.runReconciliationMatching(
        req.user!.organizationId,
        req.user!.id
      );
      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Manually resolve / link match
   */
  async manualResolve(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await reconciliationService.manualResolveMatch(
        String(req.params.id),
        req.user!.organizationId,
        req.body,
        req.user!.id
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}

export const reconciliationController = new ReconciliationController();
