import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Admin Statutory Receipts Audit & Financial Integrity Tests", () => {
  let adminToken: string;
  let clientToken: string;
  let organizationId: string;
  let clientId: string;
  let appId: string;
  let invoiceId: string;
  let tx1Id: string;
  let tx2Id: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Admin Login
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });

    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    // 2. Client Login
    const clientLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });

    expect(clientLogin.status).toBe(200);
    clientToken = clientLogin.body.data.tokens.accessToken;

    const org = await prisma.organization.findFirst({ where: { slug: "swift-doc" } });
    organizationId = org!.id;

    const client = await prisma.client.findFirst({ where: { email: "john.kamau@example.com" } });
    clientId = client!.id;

    // Create test Application & Invoice
    const service = await prisma.service.findFirst();
    const appRecord = await prisma.application.create({
      data: {
        organizationId,
        clientId,
        serviceId: service!.id,
        applicationNumber: `SD-APP-TEST-${Date.now()}`,
        status: "SUBMITTED",
        priority: "NORMAL",
        totalAmount: 15000,
        paidAmount: 15000,
        dueAmount: 0,
      },
    });
    appId = appRecord.id;

    const inv = await prisma.payment.create({
      data: {
        organizationId,
        clientId,
        applicationId: appId,
        invoiceNumber: `SD-INV-TEST-${Date.now()}`,
        currency: "KES",
        subtotal: 15000,
        totalAmount: 15000,
        amountPaid: 15000,
        amountDue: 0,
        status: "PAID",
      },
    });
    invoiceId = inv.id;

    // Create two test transactions and receipts (MPESA and BANK)
    const tx1 = await prisma.paymentTransaction.create({
      data: {
        organizationId,
        paymentId: invoiceId,
        clientId,
        applicationId: appId,
        transactionNumber: `SD-TX-AUDIT-1-${Date.now()}`,
        transactionType: "PAYMENT",
        paymentMethod: "MPESA",
        amount: 10000,
        currency: "KES",
        status: "COMPLETED",
        idempotencyKey: `IDEMP_REC_1_${Date.now()}`,
        externalReference: `QKH99_${Date.now()}`,
        paidAt: new Date(),
      },
    });
    tx1Id = tx1.id;

    await prisma.receipt.create({
      data: {
        organizationId,
        clientId,
        applicationId: appId,
        paymentId: invoiceId,
        transactionId: tx1Id,
        receiptNumber: `SD-REC-AUDIT-1-${Date.now()}`,
        amount: 10000,
        currency: "KES",
        paymentMethod: "MPESA",
        transactionReference: tx1.externalReference,
        payerName: "John Kamau Audit",
        amountPaid: 10000,
        remainingBalance: 5000,
        issuedAt: new Date(),
      },
    });

    const tx2 = await prisma.paymentTransaction.create({
      data: {
        organizationId,
        paymentId: invoiceId,
        clientId,
        applicationId: appId,
        transactionNumber: `SD-TX-AUDIT-2-${Date.now()}`,
        transactionType: "PAYMENT",
        paymentMethod: "BANK",
        amount: 5000,
        currency: "KES",
        status: "COMPLETED",
        idempotencyKey: `IDEMP_REC_2_${Date.now()}`,
        externalReference: `FT_BANK_${Date.now()}`,
        paidAt: new Date(),
      },
    });
    tx2Id = tx2.id;

    await prisma.receipt.create({
      data: {
        organizationId,
        clientId,
        applicationId: appId,
        paymentId: invoiceId,
        transactionId: tx2Id,
        receiptNumber: `SD-REC-AUDIT-2-${Date.now()}`,
        amount: 5000,
        currency: "KES",
        paymentMethod: "BANK",
        transactionReference: tx2.externalReference,
        payerName: "John Kamau Audit",
        amountPaid: 5000,
        remainingBalance: 0,
        issuedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Cleanup created receipts and entities
    await prisma.receipt.deleteMany({ where: { applicationId: appId } }).catch(() => {});
    await prisma.paymentTransaction.deleteMany({ where: { applicationId: appId } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { applicationId: appId } }).catch(() => {});
    await prisma.application.deleteMany({ where: { id: appId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe("1. GET /api/v1/admin/receipts Authoritative Reconciliation", () => {
    it("returns paginated data, server pagination, and authoritative summary", async () => {
      const res = await request(app)
        .get("/api/v1/admin/receipts")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalReceipts).toBeGreaterThanOrEqual(2);
      expect(res.body.summary.mpesaReceipts).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.bankReceipts).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.summary.grossValue).toBe("string");
      expect(Number(res.body.summary.grossValue)).toBeGreaterThanOrEqual(15000);
    });

    it("filters receipts by payment method MPESA", async () => {
      const res = await request(app)
        .get("/api/v1/admin/receipts?paymentMethod=MPESA")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.every((r: any) => r.paymentMethod === "MPESA")).toBe(true);
    });

    it("filters receipts by payment method BANK", async () => {
      const res = await request(app)
        .get("/api/v1/admin/receipts?paymentMethod=BANK")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.every((r: any) => r.paymentMethod === "BANK")).toBe(true);
    });

    it("searches receipts by search term", async () => {
      const res = await request(app)
        .get("/api/v1/admin/receipts?search=John Kamau Audit")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects unauthorized client access to admin receipts endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/admin/receipts")
        .set("Authorization", `Bearer ${clientToken}`);

      expect([401, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });
});
