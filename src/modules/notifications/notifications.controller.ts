import { Response, NextFunction } from "express";
import { notificationService } from "./notifications.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class NotificationController {
  async listNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await notificationService.listUserNotifications(req.user!.id);
      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const updated = await notificationService.markAsRead(id, req.user!.id);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markAllAsRead(req.user!.id);
      res.status(200).json({
        success: true,
        data: { message: "All notifications marked as read" },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefs = await notificationService.getUserPreferences(req.user!.id);
      res.status(200).json({
        success: true,
        data: prefs,
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await notificationService.updateUserPreferences(req.user!.id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
