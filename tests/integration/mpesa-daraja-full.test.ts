import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { normalizeKenyanPhone } from "../../src/common/utils/phone.js";

describe("M-Pesa Daraja Integration & Acceptance Test Suite", () => {
  let adminToken: string;
  let clientAToken: string;
  let clientBToken: string;
  let clientAId: string;
  let clientAAppId: string;
  let serviceId: string;
  let invoiceId: string;
  let checkoutRequestId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Authenticate Admin
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });
    adminToken = adminLogin.body.data.tokens.accessToken;

    // 2. Authenticate Client A
    const clientALogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });
    clientAToken = clientALogin.body.data.tokens.accessToken;
    clientAId = clientALogin.body.data.client.id;

    // 3. Register fresh Client B for IDOR testing
    const clientBEmail = `mpesa.client.b.${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Mpesa Client B",
        email: clientBEmail,
        phone: "0799887766",
        password: "ClientBPassword123!",
        clientType: "INDIVIDUAL",
      });
    clientBToken = regB.body.data.tokens.accessToken;

    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;

    // Create an Application for Client A
    const appRes = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientAToken}`)
      .send({
        serviceId,
        notesSummary: "M-Pesa Daraja testing application",
      });
    clientAAppId = appRes.body.data.id;

    // Create an Invoice for Client A
    const invRes = await request(app)
      .post("/api/v1/admin/invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        applicationId: clientAAppId,
        clientId: clientAId,
        status: "ISSUED",
        lineItems: [
          {
            description: "Daraja Test Statutory Fee",
            category: "GOVERNMENT_FEE",
            quantity: 1,
            unitAmount: 2500,
            isGovernmentFee: true,
          },
          {
            description: "Swift Doc Processing Fee",
            category: "SERVICE_FEE",
            quantity: 1,
            unitAmount: 1500,
            isGovernmentFee: false,
          },
        ],
      });
    invoiceId = invRes.body.data.id;
  });

  afterAll(async () => {
    if (clientAAppId) {
      await prisma.application.delete({ where: { id: clientAAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("1. Phone Number Normalization Utility", () => {
    it("Normalizes valid Kenyan numbers in various formats to 254XXXXXXXXX", () => {
      expect(normalizeKenyanPhone("0712345678")).toBe("254712345678");
      expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
      expect(normalizeKenyanPhone("+254712345678")).toBe("254712345678");
      expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
      expect(normalizeKenyanPhone("0112345678")).toBe("254112345678");
    });

    it("Rejects invalid phone numbers", () => {
      expect(() => normalizeKenyanPhone("123")).toThrow();
      expect(() => normalizeKenyanPhone("0812345678")).toThrow();
      expect(() => normalizeKenyanPhone("abcdefghijk")).toThrow();
    });
  });

  describe("2. STK Push Security & Server-Side Amount Protection", () => {
    it("Prevents Client B from triggering STK Push on Client A's invoice (IDOR protection)", async () => {
      const res = await request(app)
        .post(`/api/v1/client/invoices/${invoiceId}/pay-mpesa`)
        .set("Authorization", `Bearer ${clientBToken}`)
        .send({
          phoneNumber: "0712345678",
          idempotencyKey: `IDEMP_IDOR_${Date.now()}`,
        });

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("Derives payment amount strictly from server invoice amountDue regardless of body amount input", async () => {
      const res = await request(app)
        .post(`/api/v1/client/invoices/${invoiceId}/pay-mpesa`)
        .set("Authorization", `Bearer ${clientAToken}`)
        .send({
          phoneNumber: "0712345678",
          amount: 5, // Client attempts to send KES 5 instead of KES 4000
          idempotencyKey: `IDEMP_AMT_${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkoutRequestId).toBeDefined();

      checkoutRequestId = res.body.data.checkoutRequestId;

      // Verify the transaction was saved with full server amount (4000)
      const tx = await prisma.paymentTransaction.findFirst({
        where: { providerReference: checkoutRequestId },
      });
      expect(tx).toBeDefined();
      expect(Number(tx?.amount)).toBe(4000);
      expect(tx?.phoneNumber).toBe("254712345678");
    });
  });

  describe("3. Webhook Callback Processing & Idempotency", () => {
    const mpesaReceiptNo = `NLK${Math.floor(10000000 + Math.random() * 90000000)}`;

    it("Processes successful Daraja STK callback, settles invoice, updates application balance, and issues receipt", async () => {
      const callbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: `MR_${Date.now()}`,
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: "The service request is processed successfully.",
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: 4000 },
                { Name: "MpesaReceiptNumber", Value: mpesaReceiptNo },
                { Name: "TransactionDate", Value: 20260821160000 },
                { Name: "PhoneNumber", Value: 254712345678 },
              ],
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/v1/payments/callbacks/mpesa")
        .send(callbackPayload);

      expect(res.status).toBe(200);
      expect(res.body.ResultCode).toBe(0);

      // 1. Verify Payment status
      const updatedInv = await prisma.payment.findUnique({
        where: { id: invoiceId },
        include: { receipts: true },
      });
      expect(updatedInv?.status).toBe("PAID");
      expect(Number(updatedInv?.amountPaid)).toBe(4000);
      expect(Number(updatedInv?.amountDue)).toBe(0);

      // 2. Verify Receipt created with M-Pesa receipt number
      expect(updatedInv?.receipts).toHaveLength(1);
      expect(updatedInv?.receipts[0].transactionReference).toBe(mpesaReceiptNo);
    });

    it("Handles duplicate callback idempotently without creating duplicate receipts", async () => {
      const duplicateCallbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: `MR_${Date.now()}`,
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: "The service request is processed successfully.",
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: 4000 },
                { Name: "MpesaReceiptNumber", Value: mpesaReceiptNo },
              ],
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/v1/payments/callbacks/mpesa")
        .send(duplicateCallbackPayload);

      expect(res.status).toBe(200);
      expect(res.body.ResultCode).toBe(0);

      // Confirm receipt count remains exactly 1
      const receiptsCount = await prisma.receipt.count({
        where: { paymentId: invoiceId },
      });
      expect(receiptsCount).toBe(1);
    });

    it("Rejects paying an already settled invoice", async () => {
      const res = await request(app)
        .post(`/api/v1/client/invoices/${invoiceId}/pay-mpesa`)
        .set("Authorization", `Bearer ${clientAToken}`)
        .send({
          phoneNumber: "0712345678",
          idempotencyKey: `IDEMP_PAID_${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/already fully paid/i);
    });
  });

  describe("4. STK Push Query Fallback Endpoint", () => {
    it("Allows client to query STK Push status by CheckoutRequestID", async () => {
      const res = await request(app)
        .get(`/api/v1/client/payments/stkpush/query/${checkoutRequestId}`)
        .set("Authorization", `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkoutRequestId).toBe(checkoutRequestId);
      expect(res.body.data.isFinal).toBe(true);
    });
  });
});
