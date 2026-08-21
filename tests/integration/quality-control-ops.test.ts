import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import bcrypt from "bcryptjs";
import { UserRole, ApplicationStatus, RequirementStatus, ClientActionType } from "@prisma/client";

describe("Quality Control Operations Center Integration Tests", () => {
  const testAdminEmail = `qc.admin.${Date.now()}@swiftdoc.co.ke`;
  const testClientEmail = `qc.client.${Date.now()}@domain.co.ke`;
  let adminToken: string;
  let orgId: string;
  let adminId: string;
  let testAppId: string;
  let testReqId: string;

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
        firstName: "QC Inspector",
        lastName: "Officer",
      },
    });
    adminId = admin.id;

    // Login Admin
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testAdminEmail, password: "AdminPassword123!" });
    adminToken = loginRes.body.data.tokens.accessToken;

    // Create Client
    const clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: testClientEmail,
        passwordHash,
        role: UserRole.CLIENT,
        isActive: true,
        isEmailVerified: true,
        firstName: "Quality",
        lastName: "Client",
      },
    });

    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        userId: clientUser.id,
        clientNumber: `CLI-QC-${Date.now()}`,
        fullName: "Quality Control Client Corp",
        email: testClientEmail,
        phone: "+254700000000",
      },
    });

    // Find existing service
    const service = await prisma.service.findFirstOrThrow({
      where: { organizationId: orgId },
    });

    // Create Application
    const testApp = await prisma.application.create({
      data: {
        organizationId: orgId,
        clientId: client.id,
        serviceId: service.id,
        applicationNumber: `SD-QC-${Date.now()}`,
        status: ApplicationStatus.DOCUMENT_RECEIVED,
        priority: "NORMAL",
      },
    });
    testAppId = testApp.id;

    // Create Requirement
    const req = await prisma.applicationRequirement.create({
      data: {
        applicationId: testAppId,
        name: "National ID Certificate Copy",
        code: "REQ_NAT_ID",
        required: true,
        status: RequirementStatus.UNDER_REVIEW,
      },
    });
    testReqId = req.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testAppId) {
      await prisma.clientAction.deleteMany({ where: { applicationId: testAppId } });
      await prisma.qualityCheck.deleteMany({ where: { applicationId: testAppId } });
      await prisma.applicationRequirement.deleteMany({ where: { applicationId: testAppId } });
      await prisma.applicationActivity.deleteMany({ where: { applicationId: testAppId } });
      await prisma.application.delete({ where: { id: testAppId } });
    }

    await prisma.user.deleteMany({
      where: { email: { in: [testAdminEmail, testClientEmail] } },
    });
    await prisma.$disconnect();
  });

  it("GET /api/v1/admin/quality/metrics returns live QC metrics", async () => {
    const res = await request(app)
      .get("/api/v1/admin/quality/metrics")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pendingInspection).toBeDefined();
    expect(res.body.data.certifiedPasses).toBeDefined();
    expect(res.body.data.returnedFlagged).toBeDefined();
    expect(res.body.data.totalMonitored).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/v1/admin/quality/queue returns items with progress metadata", async () => {
    const res = await request(app)
      .get("/api/v1/admin/quality/queue")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
  });

  it("GET /api/v1/admin/quality/eligible-applications lists application candidates", async () => {
    const res = await request(app)
      .get("/api/v1/admin/quality/eligible-applications")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const cand = res.body.data.find((c: any) => c.id === testAppId);
    expect(cand).toBeDefined();
  });

  it("POST /api/v1/admin/quality/inspections launches QC inspection", async () => {
    const res = await request(app)
      .post("/api/v1/admin/quality/inspections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        applicationId: testAppId,
        priority: "HIGH",
        notes: "Starting statutory quality inspection",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.applicationId).toBe(testAppId);
    expect(res.body.data.status).toBe(ApplicationStatus.QUALITY_CHECK);

    // Verify application status in DB
    const updatedApp = await prisma.application.findUnique({ where: { id: testAppId } });
    expect(updatedApp?.status).toBe(ApplicationStatus.QUALITY_CHECK);
    expect(updatedApp?.priority).toBe("HIGH");
  });

  it("GET /api/v1/admin/quality/inspections/:id fetches complete workspace dossier", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/quality/inspections/${testAppId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.application.id).toBe(testAppId);
    expect(res.body.data.readiness).toBeDefined();
  });

  it("POST /api/v1/admin/quality/inspections/:id/item-review reviews item & creates ClientAction when replacement is requested", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/quality/inspections/${testAppId}/item-review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        requirementId: testReqId,
        action: "REQUEST_REPLACEMENT",
        deficiencyCategory: "ILLEGIBLE",
        reviewerFeedback: "Uploaded ID copy is blurry and unreadable",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requirementId).toBe(testReqId);

    // Verify ClientAction was created
    const action = await prisma.clientAction.findFirst({
      where: { applicationId: testAppId, requirementId: testReqId },
    });
    expect(action).toBeDefined();
    expect(action?.type).toBe(ClientActionType.REPLACE_DOCUMENT);

    // Verify Application status transitioned to ADDITIONAL_INFORMATION_REQUIRED
    const appInDb = await prisma.application.findUnique({ where: { id: testAppId } });
    expect(appInDb?.status).toBe(ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED);
  });

  it("POST /api/v1/admin/quality/inspections/:id/decision executes formal sign-off decision", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/quality/inspections/${testAppId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "RETURN_TO_CLIENT",
        notes: "Returned to client due to illegible document replacement requirement.",
        failedReason: "Deficient document copy",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED);

    // Verify QualityCheck audit record was created in DB
    const qc = await prisma.qualityCheck.findFirst({
      where: { applicationId: testAppId },
      orderBy: { createdAt: "desc" },
    });
    expect(qc).toBeDefined();
    expect(qc?.result).toBe("FAILED");
  });
});
