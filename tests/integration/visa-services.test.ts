import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Visa Services Integration Tests", () => {
  let clientToken: string;
  let adminToken: string;
  let visaServiceId: string;
  let createdVisaAppId: string;
  let passportReqId: string;
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

    // Fetch UK Visitor Visa Service
    const visaService = await prisma.service.findFirst({
      where: { code: "SRV-VISA-UK-VISITOR" },
    });
    expect(visaService).toBeDefined();
    visaServiceId = visaService!.id;
  });

  afterAll(async () => {
    if (createdVisaAppId) {
      await prisma.application.delete({ where: { id: createdVisaAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("GET /api/v1/client/services includes CAT-VISA category and UK/US/Schengen visa services", async () => {
    const res = await request(app).get("/api/v1/client/services");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const visaCat = res.body.data.find((c: any) => c.code === "CAT-VISA");
    expect(visaCat).toBeDefined();
    expect(visaCat.services.length).toBeGreaterThanOrEqual(20);

    const ukVisitor = visaCat.services.find((s: any) => s.code === "SRV-VISA-UK-VISITOR");
    expect(ukVisitor).toBeDefined();
    expect(Number(ukVisitor.governmentFee)).toBe(18500);
    expect(Number(ukVisitor.serviceFee)).toBe(12000);
  });

  it("GET /api/v1/client/services/uk-visitor-visa returns service details with visa requirements", async () => {
    const res = await request(app).get("/api/v1/client/services/uk-visitor-visa");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe("SRV-VISA-UK-VISITOR");
    expect(res.body.data.requirements.length).toBeGreaterThanOrEqual(4);

    const passportReq = res.body.data.requirements.find((r: any) => r.code === "REQ-PASSPORT-BIO");
    expect(passportReq).toBeDefined();
  });

  it("POST /api/v1/client/applications creates a Visa Application with intake metadata", async () => {
    const res = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        serviceId: visaServiceId,
        notesSummary: "UK Business Visitor Visa application for London Conference",
        metadata: {
          destinationCountry: "United Kingdom",
          visaCategory: "Visitor / Tourist",
          passportNumber: "A12345678",
          passportExpiry: "2030-05-15",
          travelStartDate: "2026-10-01",
          travelEndDate: "2026-10-14",
          consularReference: "UK-LON-2026-88921",
          processingEmbassy: "UK Visas and Immigration (UKVI) High Commission Nairobi",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.applicationNumber).toMatch(/^SD-APP-\d{4}-\d{6}$/);
    expect(res.body.data.status).toBe("NEW");
    expect(res.body.data.metadata).toBeDefined();
    expect(res.body.data.metadata.destinationCountry).toBe("United Kingdom");
    expect(res.body.data.metadata.passportNumber).toBe("A12345678");

    // Fee breakdown checks
    expect(res.body.data.payments.length).toBeGreaterThan(0);
    const primaryPayment = res.body.data.payments[0];
    expect(Number(primaryPayment.governmentFee)).toBe(18500);
    expect(Number(primaryPayment.serviceFee)).toBe(12000);
    expect(Number(primaryPayment.totalAmount)).toBe(30500);

    createdVisaAppId = res.body.data.id;
    if (res.body.data.requirements && res.body.data.requirements.length > 0) {
      passportReqId = res.body.data.requirements[0].id;
    }
  });

  it("POST /api/v1/client/applications/:id/requirements/:reqId submits passport document requirement", async () => {
    expect(passportReqId).toBeDefined();

    const res = await request(app)
      .post(`/api/v1/client/applications/${createdVisaAppId}/requirements/${passportReqId}`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        valueText: "Passport A12345678 - Valid until May 2030",
        documentUrl: "https://storage.swiftdoc.co.ke/docs/passport_a12345678.pdf",
        notes: "Uploaded clear bio-page scan",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isSatisfied).toBe(true);
  });

  it("PATCH /api/v1/admin/applications/:id/status updates consular status to QUALIFICATION and add consular notes", async () => {
    expect(createdVisaAppId).toBeDefined();

    const res = await request(app)
      .patch(`/api/v1/admin/applications/${createdVisaAppId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "QUALIFICATION",
        reason: "Passport and UKVI application form verified by consular specialist desk",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Add administrative tracking note
    const noteRes = await request(app)
      .post(`/api/v1/admin/applications/${createdVisaAppId}/notes`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        content: "Biometrics appointment scheduled at TLScontact Nairobi for 2026-09-05. Consular Ref: UK-LON-2026-88921",
        visibility: "CLIENT_VISIBLE",
      });

    expect(noteRes.status).toBe(201);
    expect(noteRes.body.success).toBe(true);
  });
});
