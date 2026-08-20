import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Phase 2 Full-Cycle Operational Engine Tests", () => {
  let clientToken: string;
  let adminToken: string;
  let adminUserId: string;
  let serviceId: string;
  let createdAppId: string;
  let reqId: string;
  let govAppId: string;
  let deliveryId: string;

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
    adminUserId = adminLogin.body.data.user.id;

    // Login Client
    const clientLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });

    clientToken = clientLogin.body.data.tokens.accessToken;

    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;
  });

  afterAll(async () => {
    if (createdAppId) {
      await prisma.application.delete({ where: { id: createdAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("1. Client creates application and submits requirements", async () => {
    const res = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        serviceId,
        notesSummary: "Full company incorporation workflow test",
      });

    expect(res.status).toBe(201);
    createdAppId = res.body.data.id;
    reqId = res.body.data.requirements[0].id;

    // Submit requirement
    const subRes = await request(app)
      .post(`/api/v1/client/applications/${createdAppId}/requirements/${reqId}`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        valueText: "Acme Enterprises Kenya Ltd",
      });

    expect(subRes.status).toBe(200);
    expect(subRes.body.data.isSatisfied).toBe(true);
  });

  it("2. Admin reviews and approves client requirement", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${createdAppId}/requirements/${reqId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "APPROVED",
        notes: "Company name verified against BRS name search guidelines",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
  });

  it("3. Evaluates application readiness and workload queues", async () => {
    // Check readiness
    const readRes = await request(app)
      .get(`/api/v1/client/applications/${createdAppId}/readiness`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.data).toBeDefined();

    // Check admin workload queues
    const queueRes = await request(app)
      .get("/api/v1/admin/applications/queues?queue=unassigned")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.queue).toBe("unassigned");
  });

  it("4. Admin creates and updates Government Tracking (BRS eCitizen)", async () => {
    // Create gov application
    const createGov = await request(app)
      .post(`/api/v1/admin/government/applications/${createdAppId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        platform: "BRS",
        governmentAgency: "Business Registration Service",
        governmentService: "Private Limited Company Registration",
        externalReference: "BRS-CR-2026-99120",
        notes: "Form CR1 and CR2 submitted on BRS portal",
      });

    expect(createGov.status).toBe(201);
    govAppId = createGov.body.data.id;
    expect(createGov.body.data.externalReference).toBe("BRS-CR-2026-99120");

    // Update status to UNDER_PROCESSING
    const updateGov = await request(app)
      .patch(`/api/v1/admin/government/${govAppId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "UNDER_PROCESSING",
        statusDescription: "Officer reviewing Articles of Association",
      });

    expect(updateGov.status).toBe(200);
    expect(updateGov.body.data.status).toBe("UNDER_PROCESSING");

    // Client reads sanitized tracking
    const clientGov = await request(app)
      .get(`/api/v1/client/applications/${createdAppId}/government`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientGov.status).toBe(200);
    expect(clientGov.body.data.governmentApplications.length).toBeGreaterThan(0);
    expect(clientGov.body.data.governmentApplications[0].externalReference).toBe("BRS-CR-2026-99120");
  });

  it("5. Bi-directional messaging with client/admin visibility scoping", async () => {
    // Client sends message
    const clientMsg = await request(app)
      .post(`/api/v1/client/applications/${createdAppId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        message: "Hello team, has the name search cleared?",
      });

    expect(clientMsg.status).toBe(201);
    expect(clientMsg.body.data.visibility).toBe("CLIENT_VISIBLE");

    // Admin sends internal note/message
    const adminMsg = await request(app)
      .post(`/api/v1/admin/applications/${createdAppId}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        message: "Internal: Contacted BRS registrar directly for expedited review.",
        visibility: "INTERNAL",
      });

    expect(adminMsg.status).toBe(201);

    // Client fetches messages (should ONLY see CLIENT_VISIBLE)
    const clientFetch = await request(app)
      .get(`/api/v1/client/applications/${createdAppId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientFetch.status).toBe(200);
    const hasInternalMsg = clientFetch.body.data.some((m: any) => m.visibility === "INTERNAL");
    expect(hasInternalMsg).toBe(false);
  });

  it("6. Unified Timeline dual-view verification", async () => {
    const clientTimeline = await request(app)
      .get(`/api/v1/client/applications/${createdAppId}/timeline`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientTimeline.status).toBe(200);
    expect(clientTimeline.body.data.length).toBeGreaterThan(0);

    const adminTimeline = await request(app)
      .get(`/api/v1/admin/applications/${createdAppId}/timeline`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminTimeline.status).toBe(200);
    expect(adminTimeline.body.data.length).toBeGreaterThanOrEqual(clientTimeline.body.data.length);
  });

  it("7. Quality Check checkpoint execution", async () => {
    const qcStatus = await request(app)
      .get(`/api/v1/admin/quality/applications/${createdAppId}/status`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(qcStatus.status).toBe(200);
    expect(qcStatus.body.data.automatedChecks).toBeDefined();

    const qcPerform = await request(app)
      .post(`/api/v1/admin/quality/applications/${createdAppId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        result: "PASSED",
        checklist: {
          clientMatch: true,
          documentsLegible: true,
          correctService: true,
          requiredPagesPresent: true,
          govDocVerified: true,
        },
        notes: "All official documents authenticated against BRS register.",
      });

    expect(qcPerform.status).toBe(201);
    expect(qcPerform.body.data.result).toBe("PASSED");
  });

  it("8. Digital Delivery dispatch and confirmation", async () => {
    const dispatchRes = await request(app)
      .post(`/api/v1/admin/delivery/applications/${createdAppId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        deliveryMethod: "DIGITAL",
        recipientName: "John Kamau",
        recipientPhone: "+254712345678",
        recipientEmail: "john.kamau@example.com",
        notes: "Official certificate of incorporation delivered digitally",
      });

    expect(dispatchRes.status).toBe(201);
    expect(dispatchRes.body.data.deliveryMethod).toBe("DIGITAL");
    deliveryId = dispatchRes.body.data.id;

    // Check client delivery view
    const clientDel = await request(app)
      .get(`/api/v1/client/applications/${createdAppId}/delivery`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientDel.status).toBe(200);
    expect(clientDel.body.data.length).toBeGreaterThan(0);
  });

  it("9. Admin & Client Dashboard metrics integration", async () => {
    const adminDash = await request(app)
      .get("/api/v1/admin/dashboard/overview")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminDash.status).toBe(200);
    expect(adminDash.body.data.summary.totalApplications).toBeGreaterThan(0);
    expect(adminDash.body.data.sla).toBeDefined();

    const clientDash = await request(app)
      .get("/api/v1/client/dashboard/overview")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientDash.status).toBe(200);
    expect(clientDash.body.data.totalApplications).toBeGreaterThan(0);
  });
});
