import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import bcrypt from "bcryptjs";
import { UserRole, PaymentStatus, RefundStatus, PaymentMethod } from "@prisma/client";

describe("Admin Refund Management Module Integration Tests", () => {
  const testAdminEmail = `refund.admin.${Date.now()}@swiftdoc.co.ke`;
  const testClientEmail = `refund.client.${Date.now()}@domain.co.ke`;

  let adminToken: string;
  let clientToken: string;
  let orgId: string;
  let adminId: string;
  let clientId: string;
  let clientUserId: string;

  let serviceId: string;
  let testAppId: string;
  let testPaymentId: string;
  let testTxId: string;

  let initiatedRefundId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: "swift-doc" } });
    orgId = org.id;

    const passwordHash = await bcrypt.hash("AdminPassword123!", 10);

    // Create Admin User
    const admin = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: testAdminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
        firstName: "Refund",
        lastName: "Auditor",
      },
    });
    adminId = admin.id;

    // Login Admin
    const adminLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testAdminEmail, password: "AdminPassword123!" });
    adminToken = adminLoginRes.body.data.tokens.accessToken;

    // Create Client User
    const clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: testClientEmail,
        passwordHash,
        role: UserRole.CLIENT,
        isActive: true,
        isEmailVerified: true,
        firstName: "Refund",
        lastName: "Customer",
      },
    });
    clientUserId = clientUser.id;

    // Login Client
    const clientLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testClientEmail, password: "AdminPassword123!" });
    clientToken = clientLoginRes.body.data.tokens.accessToken;

    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        userId: clientUser.id,
        clientNumber: `CLI-RF-${Date.now()}`,
        fullName: "Refund Integration Customer",
        email: testClientEmail,
        phone: "+254711223344",
      },
    });
    clientId = client.id;

    const service = await prisma.service.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    serviceId = service.id;

    // Create Application
    const appRec = await prisma.application.create({
      data: {
        organizationId: orgId,
        clientId: client.id,
        serviceId: service.id,
        applicationNumber: `SD-RF-${Date.now()}`,
        status: "SUBMITTED",
      },
    });
    testAppId = appRec.id;

    // Create Paid Invoice
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        clientId: client.id,
        applicationId: appRec.id,
        invoiceNumber: `INV-RF-${Date.now()}`,
        subtotal: 10000,
        governmentFee: 5000,
        serviceFee: 5000,
        totalAmount: 10000,
        amountPaid: 10000,
        amountDue: 0,
        status: PaymentStatus.PAID,
        currency: "KES",
      },
    });
    testPaymentId = payment.id;

    // Create Completed Payment Transaction
    const tx = await prisma.paymentTransaction.create({
      data: {
        organizationId: orgId,
        paymentId: payment.id,
        clientId: client.id,
        applicationId: appRec.id,
        transactionNumber: `TX-RF-${Date.now()}`,
        transactionType: "PAYMENT",
        paymentMethod: PaymentMethod.MPESA,
        amount: 10000,
        currency: "KES",
        status: PaymentStatus.COMPLETED,
        idempotencyKey: `idemp-rf-${Date.now()}`,
        phoneNumber: "+254711223344",
        externalReference: `QRF${Date.now().toString().slice(-6)}`,
      },
    });
    testTxId = tx.id;
  });

  afterAll(async () => {
    // Cleanup test records
    if (testPaymentId) {
      const entityIds = [testPaymentId, testTxId].filter(Boolean);
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId, entityId: { in: entityIds } } });
      await prisma.refund.deleteMany({ where: { paymentId: testPaymentId } });
      if (testTxId) {
        await prisma.paymentTransaction.deleteMany({ where: { id: testTxId } });
      }
      await prisma.payment.delete({ where: { id: testPaymentId } });
    }
    if (testAppId) {
      await prisma.application.delete({ where: { id: testAppId } });
    }
    if (clientId) {
      await prisma.client.delete({ where: { id: clientId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [testAdminEmail, testClientEmail] } },
    });
    await prisma.$disconnect();
  });

  it("1. GET /api/v1/admin/refunds/eligible-sources returns candidate paid invoices", async () => {
    const res = await request(app)
      .get("/api/v1/admin/refunds/eligible-sources")
      .set("Authorization", `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.error("Test 1 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find((src: any) => src.paymentId === testPaymentId);
    expect(found).toBeDefined();
    expect(Number(found.remainingRefundable)).toBe(10000);
  });

  it("2. POST /api/v1/admin/refunds rejects refund request exceeding remaining balance", async () => {
    const res = await request(app)
      .post("/api/v1/admin/refunds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        paymentId: testPaymentId,
        transactionId: testTxId,
        amount: 15000, // Exceeds 10000
        reason: "Test excessive refund amount",
        reasonCategory: "CLIENT_OVERPAYMENT",
        refundMethod: "MPESA",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("3. POST /api/v1/admin/refunds initiates manual refund claim successfully", async () => {
    const res = await request(app)
      .post("/api/v1/admin/refunds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        paymentId: testPaymentId,
        transactionId: testTxId,
        amount: 4000,
        reason: "Client partial service cancellation refund",
        reasonCategory: "SERVICE_CANCELLATION",
        refundMethod: "MPESA",
        recipientPhone: "+254711223344",
        internalNotes: "Verified by lead auditor",
      });

    if (res.status !== 201) {
      console.error("Test 3 error body:", res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(Number(res.body.data.amount)).toBe(4000);
    expect(res.body.data.status).toBe(RefundStatus.PENDING_APPROVAL);

    initiatedRefundId = res.body.data.id;
  });

  it("4. GET /api/v1/admin/refunds lists refunds with KPI metrics", async () => {
    const res = await request(app)
      .get("/api/v1/admin/refunds")
      .set("Authorization", `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.error("Test 4 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.pendingApproval).toBeGreaterThanOrEqual(1);
  });

  it("5. GET /api/v1/admin/refunds/:id returns complete dossier with financial summary", async () => {
    expect(initiatedRefundId).toBeDefined();
    const res = await request(app)
      .get(`/api/v1/admin/refunds/${initiatedRefundId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.error("Test 5 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(initiatedRefundId);
    expect(res.body.data.financialSummary).toBeDefined();
    expect(Number(res.body.data.financialSummary.remainingRefundableBalance)).toBe(6000);
  });

  it("6. POST /api/v1/admin/refunds/:id/approve transitions status to APPROVED", async () => {
    expect(initiatedRefundId).toBeDefined();
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${initiatedRefundId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "Approved by finance manager" });

    if (res.status !== 200) {
      console.error("Test 6 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RefundStatus.APPROVED);
    expect(res.body.data.approvedById).toBe(adminId);
  });

  it("7. POST /api/v1/admin/refunds/:id/process transitions status to PROCESSING", async () => {
    expect(initiatedRefundId).toBeDefined();
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${initiatedRefundId}/process`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "Queued for M-Pesa batch disbursement" });

    if (res.status !== 200) {
      console.error("Test 7 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RefundStatus.PROCESSING);
  });

  it("8. POST /api/v1/admin/refunds/:id/complete finalizes disbursement atomically", async () => {
    expect(initiatedRefundId).toBeDefined();
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${initiatedRefundId}/complete`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        notes: "M-Pesa reversal completed successfully",
        externalReference: "MPESA-REV-891237",
      });

    if (res.status !== 200) {
      console.error("Test 8 error body:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RefundStatus.COMPLETED);
    expect(res.body.data.externalReference).toBe("MPESA-REV-891237");

    // Verify Payment status updated to PARTIALLY_REFUNDED
    const paymentInDb = await prisma.payment.findUnique({ where: { id: testPaymentId } });
    expect(paymentInDb?.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  it("9. Initiating second refund on remaining 6000 balance works", async () => {
    const res = await request(app)
      .post("/api/v1/admin/refunds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        paymentId: testPaymentId,
        transactionId: testTxId,
        amount: 6000,
        reason: "Full remaining balance refund",
        reasonCategory: "CLIENT_OVERPAYMENT",
        refundMethod: "MPESA",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const secondRefundId = res.body.data.id;

    // Reject the second refund to test reject endpoint
    const rejectRes = await request(app)
      .post(`/api/v1/admin/refunds/${secondRefundId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Duplicate request rejected" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe(RefundStatus.REJECTED);
  });

  it("10. RBAC: Non-admin client cannot access admin refund APIs", async () => {
    const res = await request(app)
      .get("/api/v1/admin/refunds")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(403);
  });
});
