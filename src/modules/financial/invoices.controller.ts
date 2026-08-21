import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { invoicesService } from "./invoices.service.js";
import { paymentService } from "../payments/payments.service.js";

export class InvoicesController {
  /**
   * Client: List own invoices
   */
  async listClientInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const organizationId = req.user!.organizationId;

      const result = await invoicesService.listClientInvoices(clientId, organizationId, req.query as any);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: Get single invoice
   */
  async getClientInvoiceById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const organizationId = req.user!.organizationId;

      const invoice = await invoicesService.getClientInvoiceById(String(req.params.id), clientId, organizationId);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: Get transactions for an invoice
   */
  async getClientInvoiceTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const organizationId = req.user!.organizationId;

      const transactions = await invoicesService.getInvoiceTransactions(String(req.params.id), organizationId, clientId);
      res.status(200).json({ success: true, data: transactions });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client: Pay invoice via M-Pesa STK Push
   */
  async payInvoiceMpesa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.initiateMpesaStkPush(
        {
          invoiceId: String(req.params.id),
          phoneNumber: req.body.phoneNumber,
          amount: req.body.amount,
          idempotencyKey: req.body.idempotencyKey,
        },
        req.user!
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client / Admin: Get invoice live status & remaining balance
   */
  async getInvoiceStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const isClient = req.user!.role === "CLIENT";
      const clientId = isClient ? req.user!.clientId! : undefined;

      const status = await invoicesService.getInvoiceStatus(String(req.params.id), req.user!.organizationId, clientId);
      res.status(200).json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: List all invoices
   */
  async listAdminInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoicesService.listAdminInvoices(req.user!.organizationId, req.query as any);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get single invoice with full details
   */
  async getAdminInvoiceById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await invoicesService.getAdminInvoiceById(String(req.params.id), req.user!.organizationId);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Create a new invoice
   */
  async createInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await invoicesService.createInvoice(req.body, {
        id: req.user!.id,
        organizationId: req.user!.organizationId,
      });

      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Update draft invoice
   */
  async updateDraftInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await invoicesService.updateDraftInvoice(
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

  /**
   * Admin: Formally issue invoice
   */
  async issueInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const issued = await invoicesService.issueInvoice(
        String(req.params.id),
        req.user!.organizationId,
        req.body,
        req.user!.id
      );

      res.status(200).json({ success: true, data: issued });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Resend/Send invoice notification to client
   */
  async resendNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoicesService.sendInvoiceNotification(
        String(req.params.id),
        req.user!.organizationId,
        req.user!.id
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Cancel invoice
   */
  async cancelInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cancelled = await invoicesService.cancelInvoice(
        String(req.params.id),
        req.user!.organizationId,
        req.body.reason,
        req.user!.id
      );

      res.status(200).json({ success: true, data: cancelled });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Apply financial adjustment
   */
  async applyAdjustment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adjusted = await invoicesService.applyFinancialAdjustment(
        String(req.params.id),
        req.user!.organizationId,
        req.body,
        req.user!.id
      );

      res.status(200).json({ success: true, data: adjusted });
    } catch (error) {
      next(error);
    }
  }
}

export const invoicesController = new InvoicesController();
