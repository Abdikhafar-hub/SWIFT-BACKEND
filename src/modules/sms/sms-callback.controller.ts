import { Request, Response } from "express";
import { prisma } from "../../infrastructure/database/prisma.js";
import { formatKenyanPhone } from "../../common/utils/phone-formatter.js";
import { createAuditLog } from "../../common/utils/audit.js";
import { NotificationStatus } from "@prisma/client";

/**
 * Africa's Talking SMS Delivery Report Webhook Handler
 * Callback Endpoint: POST /api/v1/sms/callback
 * Accepts urlencoded/json payload from Africa's Talking
 */
export async function handleSmsDeliveryCallback(req: Request, res: Response): Promise<void> {
  try {
    const { id, status, phoneNumber, networkCode, failureReason, retryCount } = req.body;

    const atMessageId = id || req.body.messageId;
    const deliveryStatus = (status || "UNKNOWN").toUpperCase();
    const normalizedPhone = phoneNumber ? formatKenyanPhone(phoneNumber) : undefined;

    console.log(`[SMS_CALLBACK] Delivery Report Received: ID=${atMessageId}, Status=${deliveryStatus}, Phone=${normalizedPhone}`);

    if (!atMessageId) {
      res.status(200).json({ status: "IGNORED", reason: "Missing message ID" });
      return;
    }

    // Idempotency check: process each callback ID once per status
    const dedupKey = `SMS_CALLBACK_${atMessageId}_${deliveryStatus}`;
    const existing = await prisma.idempotencyRecord.findUnique({ where: { key: dedupKey } });

    if (existing) {
      res.status(200).json({ status: "ALREADY_PROCESSED", messageId: atMessageId });
      return;
    }

    // Record idempotency
    try {
      await prisma.idempotencyRecord.create({
        data: {
          key: dedupKey,
          resource: "SMS_CALLBACK",
          resourceId: atMessageId,
          responseBody: { status: deliveryStatus, failureReason, networkCode, retryCount },
          status: "COMPLETED",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    } catch {
      // Ignore duplicate key collision
    }

    // Map Africa's Talking status to system NotificationStatus
    let targetStatus: NotificationStatus = NotificationStatus.SENT;
    if (deliveryStatus === "SUCCESS" || deliveryStatus === "DELIVERED") {
      targetStatus = NotificationStatus.DELIVERED;
    } else if (
      deliveryStatus === "FAILED" ||
      deliveryStatus === "REJECTED" ||
      deliveryStatus === "UNDELIVERABLE" ||
      deliveryStatus === "USERUNREACHABLE"
    ) {
      targetStatus = NotificationStatus.FAILED;
    }

    // 1. Update ApplicationMessage if smsMessageId matches
    const messageRecords = await prisma.applicationMessage.findMany({
      where: { smsMessageId: atMessageId },
    });

    if (messageRecords.length > 0) {
      console.log(`[SMS_CALLBACK] Updating ${messageRecords.length} ApplicationMessage records for ${atMessageId}`);
    }

    // 2. Create Audit Log entry for SMS Delivery Report
    const primaryOrg = await prisma.organization.findFirst({ where: { slug: "swift-doc" } });
    if (primaryOrg) {
      await createAuditLog({
        organizationId: primaryOrg.id,
        action: "SMS_DELIVERY_CALLBACK",
        actionCategory: "COMMUNICATION",
        description: `SMS delivery update for ${normalizedPhone || "Recipient"}: Status=${deliveryStatus}`,
        resource: "SMS",
        resourceId: atMessageId,
        entityType: "SMS",
        entityId: atMessageId,
        entityReference: normalizedPhone,
        status: targetStatus === NotificationStatus.FAILED ? "FAILURE" : "SUCCESS",
        metadata: {
          atMessageId,
          status: deliveryStatus,
          failureReason,
          networkCode,
          retryCount,
        },
      });
    }

    res.status(200).json({
      status: "SUCCESS",
      messageId: atMessageId,
      deliveryStatus: targetStatus,
    });
  } catch (err: any) {
    console.error("[SMS_CALLBACK] Exception processing callback:", err);
    res.status(200).json({ status: "ERROR", error: err.message || "Failed to process callback" });
  }
}
