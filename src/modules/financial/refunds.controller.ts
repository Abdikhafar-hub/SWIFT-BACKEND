import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { refundsService } from "./refunds.service.js";

export class RefundsController {
  /**
   * Admin: List all refunds
   */
  async listAdminRefunds(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await refundsService.listAdminRefunds(req.user!.organizationId, req.query as any);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get single refund
   */
  async getAdminRefundById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refund = await refundsService.getAdminRefundById(String(req.params.id), req.user!.organizationId);
      res.status(200).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Request a new refund
   */
  async requestRefund(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refund = await refundsService.requestRefund(req.body, {
        id: req.user!.id,
        organizationId: req.user!.organizationId,
      });

      res.status(201).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Approve and process a refund
   */
  async approveRefund(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refund = await refundsService.approveAndProcessRefund(
        String(req.params.id),
        req.user!.organizationId,
        {
          id: req.user!.id,
          organizationId: req.user!.organizationId,
        },
        req.body.notes
      );

      res.status(200).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Reject a refund request
   */
  async rejectRefund(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refund = await refundsService.rejectRefund(
        String(req.params.id),
        req.user!.organizationId,
        {
          id: req.user!.id,
          organizationId: req.user!.organizationId,
        },
        req.body.reason
      );

      res.status(200).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }
}

export const refundsController = new RefundsController();
