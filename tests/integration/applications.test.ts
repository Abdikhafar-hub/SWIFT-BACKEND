import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Application Domain Integration Tests", () => {
  let clientToken: string;
  let adminToken: string;
  let serviceId: string;
  let createdAppId: string;
  let requirementId: string;
  let adminUserId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Login as Admin
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });

    adminToken = adminLogin.body.data.tokens.accessToken;
    adminUserId = adminLogin.body.data.user.id;

    // Login as Client
    const clientLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });

    clientToken = clientLogin.body.data.tokens.accessToken;

    // Fetch a service
    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;
  });

  afterAll(async () => {
    // Cleanup created test application
    if (createdAppId) {
      await prisma.application.delete({ where: { id: createdAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("POST /api/v1/client/applications creates an application with atomic requirement snapshots and payment invoice", async () => {
    const res = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        serviceId,
        notesSummary: "Registering my new technology consulting company",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.applicationNumber).toMatch(/^SD-APP-\d{4}-\d{6}$/);
    expect(res.body.data.status).toBe("NEW");
    expect(res.body.data.requirements.length).toBeGreaterThan(0);
    expect(res.body.data.payments.length).toBeGreaterThan(0);
    expect(res.body.data.payments[0].invoiceNumber).toMatch(/^SD-INV-\d{4}-\d{6}$/);

    createdAppId = res.body.data.id;
    requirementId = res.body.data.requirements[0].id;
  });

  it("POST /api/v1/client/applications/:id/requirements/:reqId submits a client requirement value", async () => {
    const res = await request(app)
      .post(`/api/v1/client/applications/${createdAppId}/requirements/${requirementId}`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        valueText: "1. Swift Tech Ltd, 2. Swift Solutions Ltd, 3. Swift Cloud Ltd",
        notes: "Preferred name is option 1",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isSatisfied).toBe(true);
    expect(res.body.data.valueText).toContain("Swift Tech Ltd");
  });

  it("PATCH /api/v1/admin/applications/:id/status transitions application lifecycle status with state machine enforcement", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${createdAppId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "QUALIFICATION",
        reason: "Initial requirements verified by compliance desk",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("QUALIFICATION");
  });

  it("PATCH /api/v1/admin/applications/:id/assign assigns application to an admin officer", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${createdAppId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        assignedAdminId: adminUserId,
        reason: "Assigned for BRS company filing",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assignedAdminId).toBe(adminUserId);
  });

  it("POST /api/v1/admin/applications/:id/notes adds an internal administrative note", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/applications/${createdAppId}/notes`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        content: "Name search submitted on BRS portal. Waiting for approval.",
        visibility: "INTERNAL",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.visibility).toBe("INTERNAL");
  });
});
