import { Request, Response, NextFunction } from "express";
import { paymentService } from "./payments.service.js";
import { refundsService } from "../financial/refunds.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class PaymentController {
  /**
   * Initiate M-Pesa STK Push (Client / Admin)
   */
  async initiateMpesaPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.initiateMpesaStkPush(
        {
          applicationId: req.body.applicationId,
          invoiceId: req.body.invoiceId,
          phoneNumber: req.body.phoneNumber,
          amount: req.body.amount,
          idempotencyKey: req.body.idempotencyKey,
        },
        req.user!
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Safaricom M-Pesa STK Callback (Public Webhook)
   */
  async handleMpesaCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.handleMpesaCallback(req.body);

      // Safaricom expects a fast 200 response with { ResultCode: 0, ResultDesc: "Accepted" }
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Accepted",
        internalResult: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Record manual payment (Cash, Bank, Cheque, Card)
   */
  async recordManualPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.recordManualPayment(
        {
          applicationId: req.body.applicationId,
          invoiceId: req.body.invoiceId,
          paymentMethod: req.body.paymentMethod,
          amount: req.body.amount,
          externalReference: req.body.externalReference,
          notes: req.body.notes,
          idempotencyKey: req.body.idempotencyKey,
        },
        {
          id: req.user!.id,
          email: req.user!.email,
          organizationId: req.user!.organizationId,
        }
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Reverse an existing transaction
   */
  async reversePayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.reversePaymentTransaction(
        String(req.params.id),
        req.user!.organizationId,
        req.body.reason,
        {
          id: req.user!.id,
          email: req.user!.email,
          organizationId: req.user!.organizationId,
        }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: List client payment transactions
   */
  async listClientTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const result = await paymentService.listClientTransactions(
        clientId,
        req.user!.organizationId,
        req.query as any
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: Get single client transaction by ID
   */
  async getClientTransactionById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const transaction = await paymentService.getClientTransactionById(
        String(req.params.id),
        clientId,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: List all transactions ledger
   */
  async listAdminTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.listAdminTransactions(
        req.user!.organizationId,
        req.query as any
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get single transaction details
   */
  async getAdminTransactionById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await paymentService.getAdminTransactionById(
        String(req.params.id),
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Request refund for transaction
   */
  async requestPaymentRefund(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const transactionId = String(req.params.id);
      const transaction = await paymentService.getAdminTransactionById(transactionId, req.user!.organizationId);
      const refund = await refundsService.requestRefund(
        {
          paymentId: transaction.paymentId,
          transactionId: transaction.id,
          amount: req.body.amount !== undefined ? req.body.amount : transaction.amount,
          reason: req.body.reason || "Admin requested payment refund",
        },
        {
          id: req.user!.id,
          organizationId: req.user!.organizationId,
        }
      );

      res.status(201).json({
        success: true,
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();

