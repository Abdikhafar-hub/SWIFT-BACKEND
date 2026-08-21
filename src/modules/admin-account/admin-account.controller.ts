import { Response, NextFunction } from "express";
import { adminAccountService } from "./admin-account.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class AdminAccountController {
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await adminAccountService.getProfile(req.user!.id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedUser = await adminAccountService.updateProfile(
        req.user!.id,
        req.body,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        }
      );
      res.status(200).json({
        success: true,
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadProfileImage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminAccountService.uploadProfileImage(
        req.user!.id,
        req.body,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
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

  async deleteProfileImage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedUser = await adminAccountService.deleteProfileImage(
        req.user!.id,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        }
      );
      res.status(200).json({
        success: true,
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await adminAccountService.changePassword(
        req.user!.id,
        currentPassword,
        newPassword,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
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

  async requestEmailChange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newEmail } = req.body;
      const result = await adminAccountService.requestEmailChange(
        req.user!.id,
        currentPassword,
        newEmail,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
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

  async verifyEmailChange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.body;
      const result = await adminAccountService.verifyEmailChange(
        req.user!.id,
        code,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
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

  async getNotificationPreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefs = await adminAccountService.getNotificationPreferences(req.user!.id);
      res.status(200).json({
        success: true,
        data: prefs,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateNotificationPreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedPrefs = await adminAccountService.updateNotificationPreferences(
        req.user!.id,
        req.body,
        {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        }
      );
      res.status(200).json({
        success: true,
        data: updatedPrefs,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminAccountController = new AdminAccountController();
