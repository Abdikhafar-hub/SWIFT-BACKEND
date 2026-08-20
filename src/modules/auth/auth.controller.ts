import { Request, Response, NextFunction, CookieOptions } from "express";
import { authService } from "./auth.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { env } from "../../config/env.js";

const REFRESH_COOKIE_NAME = "sd_refresh";

function setRefreshCookie(res: Response, refreshToken: string): void {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
  });
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(
        req.body,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      setRefreshCookie(res, result.tokens.refreshToken);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.login(
        email,
        password,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      setRefreshCookie(res, result.tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Refresh token cookie or payload missing.",
          },
        });
        return;
      }

      const result = await authService.refreshToken(
        refreshToken,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      setRefreshCookie(res, result.tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  }

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      await authService.logout(refreshToken, req.user?.id);
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: { message: "Successfully logged out." },
      });
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  }

  async logoutAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.logoutAll(
        req.user!.id,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  }

  async ping(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.pingSession(req.user!.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.getMe(req.user!.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(
        email,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      const result = await authService.resetPassword(
        token,
        newPassword,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await authService.changePassword(
        req.user!.id,
        currentPassword,
        newPassword,
        req.ip || req.socket.remoteAddress,
        req.headers["user-agent"]
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.body;
      const result = await authService.verifyEmailOtp(req.user!.id, code);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resendOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.resendOtp(req.user!.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
