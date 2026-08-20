import { Router } from "express";
import { authController } from "./auth.controller.js";
import { validate } from "../../common/middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  changePasswordSchema,
  verifyOtpSchema,
} from "./auth.schema.js";
import { authenticate } from "../../common/middleware/auth.js";

const router = Router();

router.post("/register", validate({ body: registerSchema }), authController.register);
router.post("/login", validate({ body: loginSchema }), authController.login);
router.post("/refresh", validate({ body: refreshSchema }), authController.refresh);
router.post("/logout", validate({ body: logoutSchema }), authController.logout);
router.post("/forgot-password", validate({ body: passwordResetRequestSchema }), authController.forgotPassword);
router.post("/reset-password", validate({ body: passwordResetConfirmSchema }), authController.resetPassword);
router.post("/change-password", authenticate, validate({ body: changePasswordSchema }), authController.changePassword);
router.post("/verify-otp", authenticate, validate({ body: verifyOtpSchema }), authController.verifyOtp);
router.post("/resend-otp", authenticate, authController.resendOtp);
router.get("/me", authenticate, authController.getMe);

export const authRoutes = router;

