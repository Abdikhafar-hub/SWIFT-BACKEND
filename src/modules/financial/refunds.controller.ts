import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { refundsService } from "./refunds.service.js";

export class RefundsController {
  /**
   * Admin: Get eligible financial sources (clients, paid invoices, refundable balances)
   */
  async getEligibleFinancialSources(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sources = await refundsService.getEligibleFinancialSources(
        req.user!.organizationId,
        {
          search: req.query.search as string,
          clientId: req.query.clientId as string,
        }
      );
      res.status(200).json({ success: true, data: sources });
    } catch (error) {
      console.error("GET ELIGIBLE SOURCES CONTROLLER ERROR:", error);
      next(error);
    }
  }

  /**
   * Admin: List all refunds
   */
  async listAdminRefunds(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await refundsService.listAdminRefunds(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get single refund by ID
   */
  async getAdminRefundById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.getAdminRefundById(
        String(req.params.id),
        req.user!.organizationId
      );
      res.status(200).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Initiate / request a new refund manually
   */
  async initiateRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.initiateRefund(req.body, {
        id: req.user!.id,
        organizationId: req.user!.organizationId,
      });

      res.status(201).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Approve a refund request
   */
  async approveRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.approveRefund(
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
   * Admin: Begin processing a refund disbursement
   */
  async processRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.processRefund(
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
   * Admin: Complete refund disbursement
   */
  async completeRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.completeRefund(
        String(req.params.id),
        req.user!.organizationId,
        {
          id: req.user!.id,
          organizationId: req.user!.organizationId,
        },
        req.body.notes,
        req.body.externalReference
      );

      res.status(200).json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Reject a refund request
   */
  async rejectRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  /**
   * Admin: Cancel a refund request
   */
  async cancelRefund(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refund = await refundsService.cancelRefund(
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
