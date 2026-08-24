import { Router } from "express";
import { handleSmsDeliveryCallback } from "./sms-callback.controller.js";
import { getSmsProviderStatus, getSmsHealthDiagnostics } from "../../infrastructure/sms/index.js";

const router = Router();

/**
 * Public Africa's Talking Delivery Webhook
 * POST /api/v1/sms/callback
 */
router.post("/callback", handleSmsDeliveryCallback);

/**
 * SMS Provider Diagnostic & Status Check Endpoint
 * GET /api/v1/sms/status
 */
router.get("/status", (req, res) => {
  res.status(200).json({
    success: true,
    ...getSmsProviderStatus(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Safe Africa's Talking Account Health Diagnostic Endpoint (No SMS Dispatched)
 * GET /api/v1/sms/health
 */
router.get("/health", async (req, res) => {
  const health = await getSmsHealthDiagnostics();
  res.status(200).json({
    success: true,
    ...health,
  });
});

export const smsRoutes = router;
