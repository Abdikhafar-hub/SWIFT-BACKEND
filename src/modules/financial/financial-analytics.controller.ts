import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { financialAnalyticsService } from "./financial-analytics.service.js";

export class FinancialAnalyticsController {
  /**
   * Admin: Executive financial summary
   */
  async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await financialAnalyticsService.getFinancialSummary(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Collections breakdown by method
   */
  async getCollections(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const collections = await financialAnalyticsService.getCollectionsAnalytics(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, data: collections });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Outstanding invoices list with aging analysis
   */
  async getOutstanding(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const outstanding = await financialAnalyticsService.getOutstandingInvoices(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, ...outstanding });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Overdue invoices queue
   */
  async getOverdue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const overdue = await financialAnalyticsService.getOverdueInvoices(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, ...overdue });
    } catch (error) {
      next(error);
    }
  }
}

export const financialAnalyticsController = new FinancialAnalyticsController();
