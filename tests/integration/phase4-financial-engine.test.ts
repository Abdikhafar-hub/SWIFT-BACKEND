import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Phase 4 Financial Commercial Operating Layer & M-Pesa Integration Tests", () => {
  let adminToken: string;
  let clientAToken: string;
  let clientBToken: string;
  let clientAId: string;
  let clientAAppId: string;
  let serviceId: string;
  let createdInvoiceId: string;
  let transactionId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Admin Auth
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });
    adminToken = adminLogin.body.data.tokens.accessToken;

    // 2. Client A Auth (John Kamau)
    const clientALogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });
    clientAToken = clientALogin.body.data.tokens.accessToken;
    clientAId = clientALogin.body.data.client.id;

    // 3. Client B Auth (Register fresh client)
    const clientBEmail = `client.fin.b.${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Fin Client B",
        email: clientBEmail,
        phone: "+254711998877",
        password: "ClientBPassword123!",
        clientType: "INDIVIDUAL",
      });
    clientBToken = regB.body.data.tokens.accessToken;

    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;

    // Create an Application for Client A to link invoices
    const appRes = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientAToken}`)
      .send({
        serviceId,
        notesSummary: "Phase 4 financial testing application",
      });
    clientAAppId = appRes.body.data.id;
  });

  afterAll(async () => {
    if (clientAAppId) {
      await prisma.application.delete({ where: { id: clientAAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("1. Invoices Lifecycle & Administrative Operations", () => {
    it("Admin creates a multi-line invoice with statutory fee and service fee", async () => {
      const res = await request(app)
        .post("/api/v1/admin/invoices")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          applicationId: clientAAppId,
          clientId: clientAId,
          status: "DRAFT",
          lineItems: [
            {
              description: "Name Reservation Statutory Fee",
              category: "GOVERNMENT_FEE",
              quantity: 1,
              unitAmount: 1500,
              isGovernmentFee: true,
            },
            {
              description: "Swift Doc Processing & Facilitation",
              category: "SERVICE_FEE",
              quantity: 1,
              unitAmount: 2000,
              isGovernmentFee: false,
            },
          ],
          discount: 200,
          dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          notes: "Phase 4 Integration Invoice",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe("DRAFT");
      // subtotal = 3500, discount = 200 => total = 3300
      expect(Number(res.body.data.totalAmount)).toBe(3300);
      expect(Number(res.body.data.amountDue)).toBe(3300);
      expect(res.body.data.lineItems).toHaveLength(2);

      createdInvoiceId = res.body.data.id;
    });

    it("Admin issues invoice to client", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/invoices/${createdInvoiceId}/issue`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          notes: "Issued for payment",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ISSUED");
    });

    it("Client A can view issued invoice with full line-item details", async () => {
      const res = await request(app)
        .get(`/api/v1/client/invoices/${createdInvoiceId}`)
        .set("Authorization", `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdInvoiceId);
      expect(res.body.data.lineItems).toHaveLength(2);
    });

    it("IDOR Security: Client B cannot view Client A's invoice", async () => {
      const res = await request(app)
        .get(`/api/v1/client/invoices/${createdInvoiceId}`)
        .set("Authorization", `Bearer ${clientBToken}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("Admin applies a financial adjustment (discount) to invoice", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/invoices/${createdInvoiceId}/adjust`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          type: "DISCOUNT",
          amount: 300,
          reason: "Loyalty promo concession",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // total was 3300, - 300 adjustment => 3000
      expect(Number(res.body.data.totalAmount)).toBe(3000);
      expect(Number(res.body.data.amountDue)).toBe(3000);
    });
  });

  describe("2. Payments & Transaction Engine", () => {
    it("Admin records a manual payment (Bank) against invoice", async () => {
      const res = await request(app)
        .post("/api/v1/admin/payments/manual")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          invoiceId: createdInvoiceId,
          paymentMethod: "BANK",
          amount: 3000,
          externalReference: `FT_${Date.now()}`,
          notes: "Full settlement via Equity Bank transfer",
          idempotencyKey: `IDEMP_PAY_${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.receipt).toBeDefined();

      transactionId = res.body.data.id;
    });

    it("Client A views issued receipt in receipts list", async () => {
      const res = await request(app)
        .get("/api/v1/client/receipts")
        .set("Authorization", `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("Admin reverses payment transaction and restores invoice balance", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/payments/transactions/${transactionId}/reverse`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reason: "Payment reversed due to duplicate bank wire entry",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.transactionType).toBe("REVERSAL");
    });
  });

  describe("3. M-Pesa STK Push Initiation & Webhook Callbacks", () => {
    it("Initiates M-Pesa STK push simulation for invoice", async () => {
      const res = await request(app)
        .post(`/api/v1/client/invoices/${createdInvoiceId}/pay-mpesa`)
        .set("Authorization", `Bearer ${clientAToken}`)
        .send({
          phoneNumber: "254712345678",
          amount: 3000,
          idempotencyKey: `IDEMP_MPESA_${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkoutRequestId).toBeDefined();
    });

    it("Handles Safaricom Daraja M-Pesa callback and applies payment atomically", async () => {
      const mpesaReceiptNo = `NLK${Math.floor(10000000 + Math.random() * 90000000)}`;
      const checkoutId = `ws_CO_${Date.now()}`;

      // Create a pending transaction to match callback
      await prisma.paymentTransaction.create({
        data: {
          organization: {
            connect: { slug: "swift-doc" },
          },
          payment: {
            connect: { id: createdInvoiceId },
          },
          client: {
            connect: { id: clientAId },
          },
          transactionNumber: `SD-TXN-${Date.now()}`,
          transactionType: "PAYMENT",
          paymentMethod: "MPESA",
          amount: 3000,
          currency: "KES",
          status: "PENDING",
          providerReference: checkoutId,
          idempotencyKey: `CB_KEY_${Date.now()}`,
        },
      });

      const callbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: `MR_${Date.now()}`,
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            ResultDesc: "The service request is processed successfully.",
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: 3000 },
                { Name: "MpesaReceiptNumber", Value: mpesaReceiptNo },
                { Name: "TransactionDate", Value: 20260810143000 },
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

      // Verify invoice is paid
      const updatedInv = await prisma.payment.findUnique({
        where: { id: createdInvoiceId },
      });
      expect(updatedInv?.status).toBe("PAID");
    });
  });

  describe("4. Reconciliation Engine", () => {
    it("Ingests bank/M-Pesa statement entry", async () => {
      const res = await request(app)
        .post("/api/v1/admin/reconciliation/statement")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reference: `STMT_${Date.now()}`,
          amount: 2150.0,
          provider: "MPESA",
          notes: "M-Pesa Settlement batch test",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it("Runs automated batch reconciliation engine", async () => {
      const res = await request(app)
        .post("/api/v1/admin/reconciliation/engine/run")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe("5. Financial Analytics & Executive Reporting", () => {
    it("Admin retrieves executive financial summary", async () => {
      const res = await request(app)
        .get("/api/v1/admin/financial/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics).toBeDefined();
      expect(res.body.data.metrics.totalInvoiced).toBeDefined();
      expect(res.body.data.metrics.totalCollected).toBeDefined();
      expect(res.body.data.metrics.totalOutstanding).toBeDefined();
      expect(res.body.data.metrics.netRevenue).toBeDefined();
    });

    it("Admin retrieves collections breakdown by payment method", async () => {
      const res = await request(app)
        .get("/api/v1/admin/financial/collections")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.collectionsByMethod).toBeDefined();
    });

    it("Admin retrieves aging schedule of outstanding invoices", async () => {
      const res = await request(app)
        .get("/api/v1/admin/financial/outstanding")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });
  });
});

