import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Phase 2 Security, IDOR & Concurrency Tests", () => {
  let clientAToken: string;
  let clientBToken: string;
  let adminToken: string;
  let clientAAppId: string;
  let serviceId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Login Admin
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });
    adminToken = adminLogin.body.data.tokens.accessToken;

    // Login Client A (John Kamau)
    const clientALogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });
    clientAToken = clientALogin.body.data.tokens.accessToken;

    // Register & Login Client B
    const clientBEmail = `client.b.${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Jane Wanjiku Client B",
        email: clientBEmail,
        phone: "+254788776655",
        password: "ClientBPassword123!",
        clientType: "INDIVIDUAL",
      });
    clientBToken = regB.body.data.tokens.accessToken;

    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;

    // Client A creates an application
    const appRes = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientAToken}`)
      .send({
        serviceId,
        notesSummary: "Security test application",
      });
    clientAAppId = appRes.body.data.id;
  });

  afterAll(async () => {
    if (clientAAppId) {
      await prisma.application.delete({ where: { id: clientAAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("1. IDOR Prevention: Client B cannot view Client A's application details", async () => {
    const res = await request(app)
      .get(`/api/v1/client/applications/${clientAAppId}`)
      .set("Authorization", `Bearer ${clientBToken}`);

    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("2. IDOR Prevention: Client B cannot access Client A's timeline or messages", async () => {
    const timelineRes = await request(app)
      .get(`/api/v1/client/applications/${clientAAppId}/timeline`)
      .set("Authorization", `Bearer ${clientBToken}`);

    expect([403, 404]).toContain(timelineRes.status);

    const messageRes = await request(app)
      .get(`/api/v1/client/applications/${clientAAppId}/messages`)
      .set("Authorization", `Bearer ${clientBToken}`);

    expect([403, 404]).toContain(messageRes.status);
  });

  it("3. IDOR Prevention: Client B cannot post messages to Client A's application", async () => {
    const postRes = await request(app)
      .post(`/api/v1/client/applications/${clientAAppId}/messages`)
      .set("Authorization", `Bearer ${clientBToken}`)
      .send({
        message: "Attempting unauthorized message injection",
      });

    expect([403, 404]).toContain(postRes.status);
    expect(postRes.body.success).toBe(false);
  });

  it("4. Internal Note Leakage: Internal admin notes are never returned to client endpoints", async () => {
    // Admin posts internal note
    await request(app)
      .post(`/api/v1/admin/applications/${clientAAppId}/notes`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        content: "Top secret compliance fraud check passed internally.",
        visibility: "INTERNAL",
      });

    // Client requests timeline
    const timelineRes = await request(app)
      .get(`/api/v1/client/applications/${clientAAppId}/timeline`)
      .set("Authorization", `Bearer ${clientAToken}`);

    expect(timelineRes.status).toBe(200);
    const timelineText = JSON.stringify(timelineRes.body.data);
    expect(timelineText).not.toContain("Top secret compliance fraud check");
  });

  it("5. Payment Callback Idempotency: Consecutive duplicate M-Pesa callbacks do not double count", async () => {
    const mpesaReceipt = `MPESA_TEST_${Date.now()}`;

    // Callback payload
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: `MR_${Date.now()}`,
          CheckoutRequestID: `CR_${Date.now()}`,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 500 },
              { Name: "MpesaReceiptNumber", Value: mpesaReceipt },
              { Name: "TransactionDate", Value: 20260810140000 },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    };

    // First Callback
    const firstRes = await request(app)
      .post("/api/v1/payments/callbacks/mpesa")
      .send(callbackPayload);

    expect(firstRes.status).toBe(200);

    // Second Duplicate Callback
    const secondRes = await request(app)
      .post("/api/v1/payments/callbacks/mpesa")
      .send(callbackPayload);

    expect(secondRes.status).toBe(200);

    // Verify transaction count for this receipt is strictly <= 1
    const txCount = await prisma.paymentTransaction.count({
      where: { externalReference: mpesaReceipt },
    });
    expect(txCount).toBeLessThanOrEqual(1);
  });
});
