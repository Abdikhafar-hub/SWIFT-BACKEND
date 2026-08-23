import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

describe("Government Registry Operations Integration Test Suite", () => {
  let adminToken: string;
  let testAppId: string;
  let testGovAppId: string;

  beforeAll(async () => {
    // 1. Authenticate Admin User
    const adminLoginRes = await request(app).post("/api/v1/auth/login").send({
      email: "admin@swiftdoc.co.ke",
      password: "Password123!",
    });

    if (adminLoginRes.status === 200) {
      adminToken = adminLoginRes.body.data?.token || adminLoginRes.body.token;
    } else {
      // Fallback: create admin or find existing
      const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
      if (admin) {
        // Mock token logic if needed or skip login
        const loginRes = await request(app).post("/api/v1/auth/login").send({
          email: admin.email,
          password: "Password123!",
        });
        adminToken = loginRes.body.data?.token || loginRes.body.token;
      }
    }

    // 2. Fetch or create candidate application
    const appRecord = await prisma.application.findFirst({
      select: { id: true },
    });
    testAppId = appRecord?.id || "test-app-id";
  });

  it("1. GET /api/v1/admin/government/kpis returns executive operational metrics", async () => {
    const res = await request(app)
      .get("/api/v1/admin/government/kpis")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("totalSubmissions");
    expect(res.body.data).toHaveProperty("activeFilings");
    expect(res.body.data).toHaveProperty("openQueries");
  });

  it("2. GET /api/v1/admin/government/ready-applications lists ready candidates", async () => {
    const res = await request(app)
      .get("/api/v1/admin/government/ready-applications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("3. POST /api/v1/admin/government/submissions registers a new submission", async () => {
    const res = await request(app)
      .post("/api/v1/admin/government/submissions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        applicationId: testAppId,
        platform: "eCitizen",
        governmentAgency: "Department of Immigration Services",
        governmentService: "Passport Renewal & Clearance",
        externalReference: `ECIT-TST-${Date.now()}`,
        submissionChannel: "ONLINE_PORTAL",
        statutoryFeeAmount: 4500,
        notes: "Test automated filing submission",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("id");
    testGovAppId = res.body.data.id;
  });

  it("4. GET /api/v1/admin/government/submissions/:id retrieves 360 dossier", async () => {
    if (!testGovAppId) return;

    const res = await request(app)
      .get(`/api/v1/admin/government/submissions/${testGovAppId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("govApp");
    expect(res.body.data).toHaveProperty("readinessReport");
  });

  it("5. POST /api/v1/admin/government/submissions/:id/query logs official registry query", async () => {
    if (!testGovAppId) return;

    const res = await request(app)
      .post(`/api/v1/admin/government/submissions/${testGovAppId}/query`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        queryType: "MISSING_DOCUMENT",
        severity: "HIGH",
        description: "Certified Bank Statement is required for financial verification.",
        actionRequired: "Upload 6-Month Bank Statement",
        deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
        createClientAction: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("6. POST /api/v1/admin/government/submissions/:id/payment records statutory fee payment", async () => {
    if (!testGovAppId) return;

    const res = await request(app)
      .post(`/api/v1/admin/government/submissions/${testGovAppId}/payment`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        amount: 4500,
        currency: "KES",
        paymentMethod: "MPESA",
        paymentReference: "MPESA-ECIT-98210",
        receiptNumber: "REC-2026-0012",
        status: "COMPLETED",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("7. POST /api/v1/admin/government/submissions/:id/appointment schedules registry appointment", async () => {
    if (!testGovAppId) return;

    const res = await request(app)
      .post(`/api/v1/admin/government/submissions/${testGovAppId}/appointment`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        appointmentType: "BIOMETRICS_CAPTURE",
        scheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        authorityName: "Nyayo House Immigration Desk 4",
        location: "Nyayo House, Ground Floor Room 12",
        clientInstructions: "Carry Original ID and Online Appointment Slip",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("8. POST /api/v1/admin/government/submissions/:id/follow-up logs registry chasing attempt", async () => {
    if (!testGovAppId) return;

    const res = await request(app)
      .post(`/api/v1/admin/government/submissions/${testGovAppId}/follow-up`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        method: "REGISTRY_VISIT",
        contactPerson: "Officer Mutua",
        outcome: "Dossier passed verification; awaiting final approval signoff.",
        nextFollowUpDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
