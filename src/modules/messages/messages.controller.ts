import { Response, NextFunction } from "express";
import { applicationMessageService } from "./messages.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class ApplicationMessageController {
  // Client: Send message on application
  async sendClientMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const msg = await applicationMessageService.sendMessage({
        applicationId,
        organizationId: req.user!.organizationId,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        clientId: req.user!.clientId || undefined,
        message: req.body.message,
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

  // Client: Get messages for application
  async getClientMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const messages = await applicationMessageService.getMessages({
        applicationId,
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
        clientId: req.user!.clientId || undefined,
      });

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Send message on application
  async sendAdminMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const msg = await applicationMessageService.sendMessage({
        applicationId,
        organizationId: req.user!.organizationId,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        message: req.body.message,
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

  // Admin: Get messages for application
  async getAdminMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const messages = await applicationMessageService.getMessages({
        applicationId,
        organizationId: req.user!.organizationId,
        actorRole: req.user!.role,
      });

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const applicationMessageController = new ApplicationMessageController();
