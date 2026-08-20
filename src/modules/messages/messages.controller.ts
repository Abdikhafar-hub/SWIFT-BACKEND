import { Response, NextFunction } from "express";
import { applicationMessageService } from "./messages.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class ApplicationMessageController {
  // Client: Get all Gmail-styled message threads
  async getClientThreads(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const folder = (req.query.folder as string) || "inbox";
      const search = (req.query.search as string) || "";
      const threads = await applicationMessageService.getThreads({
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
        clientId: req.user!.clientId || undefined,
        folder,
        search,
      });

      res.status(200).json({
        success: true,
        data: threads,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get all Gmail-styled message threads
  async getAdminThreads(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const folder = (req.query.folder as string) || "inbox";
      const search = (req.query.search as string) || "";
      const threads = await applicationMessageService.getThreads({
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
        folder,
        search,
      });

      res.status(200).json({
        success: true,
        data: threads,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Send message on application or new thread
  async sendClientMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id || req.body.applicationId);
      const msg = await applicationMessageService.sendMessage({
        applicationId,
        organizationId: req.user!.organizationId,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        clientId: req.user!.clientId || undefined,
        subject: req.body.subject,
        message: req.body.message,
        channel: req.body.channel,
        sendEmail: req.body.sendEmail,
        sendSms: req.body.sendSms,
        attachments: req.body.attachments,
      });

      res.status(201).json({
        success: true,
        data: msg,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Get messages for specific application thread
  async getClientMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const messages = await applicationMessageService.getMessages({
        applicationId,
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
        clientId: req.user!.clientId || undefined,
      });

      // Automatically mark thread read
      await applicationMessageService.markThreadAsRead(applicationId, req.user!.role);

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Send message on application thread
  async sendAdminMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id || req.body.applicationId);
      const msg = await applicationMessageService.sendMessage({
        applicationId,
        organizationId: req.user!.organizationId,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        subject: req.body.subject,
        message: req.body.message,
        channel: req.body.channel,
        sendEmail: req.body.sendEmail,
        sendSms: req.body.sendSms,
        visibility: req.body.visibility,
        attachments: req.body.attachments,
      });

      res.status(201).json({
        success: true,
        data: msg,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get messages for application thread
  async getAdminMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const messages = await applicationMessageService.getMessages({
        applicationId,
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
      });

      // Automatically mark thread read
      await applicationMessageService.markThreadAsRead(applicationId, req.user!.role);

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }

  // Toggle message star status
  async toggleStar(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const messageId = String(req.params.messageId);
      const applicationId = req.params.applicationId ? String(req.params.applicationId) : "";
      const updated = await applicationMessageService.toggleStar(messageId, applicationId);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}

export const applicationMessageController = new ApplicationMessageController();
