import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { receiptsService } from "./receipts.service.js";

export class ReceiptsController {
  /**
   * Client: List own receipts
   */
  async listClientReceipts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const organizationId = req.user!.organizationId;

      const result = await receiptsService.listClientReceipts(clientId, organizationId, req.query as any);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: Get receipt by ID
   */
  async getClientReceiptById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const organizationId = req.user!.organizationId;

      const receipt = await receiptsService.getClientReceiptById(String(req.params.id), clientId, organizationId);
      res.status(200).json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: List all receipts
   */
  async listAdminReceipts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await receiptsService.listAdminReceipts(req.user!.organizationId, req.query as any);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get receipt by ID
   */
  async getAdminReceiptById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const receipt = await receiptsService.getAdminReceiptById(String(req.params.id), req.user!.organizationId);
      res.status(200).json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  }
}

export const receiptsController = new ReceiptsController();
