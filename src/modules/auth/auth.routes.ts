import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "./auth.controller.js";
import { validate } from "../../common/middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  changePasswordSchema,
  verifyOtpSchema,
} from "./auth.schema.js";
import { authenticate } from "../../common/middleware/auth.js";

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many authentication requests from this IP. Please try again in 15 minutes.",
    },
  },
});

router.post("/register", authRateLimiter, validate({ body: registerSchema }), authController.register);
router.post("/login", authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/logout-all", authenticate, authController.logoutAll);
router.post("/ping", authenticate, authController.ping);
router.post("/forgot-password", authRateLimiter, validate({ body: passwordResetRequestSchema }), authController.forgotPassword);
router.post("/reset-password", authRateLimiter, validate({ body: passwordResetConfirmSchema }), authController.resetPassword);
router.post("/change-password", authenticate, validate({ body: changePasswordSchema }), authController.changePassword);
router.post("/verify-otp", authenticate, validate({ body: verifyOtpSchema }), authController.verifyOtp);
router.post("/resend-otp", authenticate, authController.resendOtp);
router.get("/me", authenticate, authController.getMe);

export const authRoutes = router;

