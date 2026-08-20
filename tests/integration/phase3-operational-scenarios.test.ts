import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { jobQueueService } from "../../src/infrastructure/jobs/job-queue.service.js";

describe("Phase 3 Master Operational Engine Scenarios", () => {
  let clientToken: string;
  let adminToken: string;
  let adminUserId: string;
  let clientUserId: string;
  let serviceId: string;
  let orgId: string;

  let testAppId: string;
  let testGovAppId: string;
  let testClientActionId: string;
  let testDocId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Admin login
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });

    adminToken = adminLogin.body.data.tokens.accessToken;
    adminUserId = adminLogin.body.data.user.id;
    orgId = adminLogin.body.data.user.organizationId;

    // 2. Client login
    const clientLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      });

    clientToken = clientLogin.body.data.tokens.accessToken;
    clientUserId = clientLogin.body.data.user.id;

    // 3. Service ID
    const service = await prisma.service.findFirst({
      where: { code: "SRV-BR-001" },
    });
    serviceId = service!.id;
  });

  afterAll(async () => {
    if (testAppId) {
      await prisma.application.delete({ where: { id: testAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("Scenario A: BRS Registration with Government Query & Resubmission", () => {
    it("A1. Client creates application and admin files BRS submission", async () => {
      const appRes = await request(app)
        .post("/api/v1/client/applications")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          serviceId,
          notesSummary: "Phase 3 Scenario A: BRS Registration",
        });

      expect(appRes.status).toBe(201);
      testAppId = appRes.body.data.id;

      // Admin creates Government filing
      const govRes = await request(app)
        .post(`/api/v1/admin/applications/${testAppId}/government`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          platform: "BRS",
          governmentAgency: "Business Registration Service",
          governmentService: "Company Incorporation",
          externalReference: "BRS-APP-2026-X99",
          status: "SUBMITTED",
          notes: "Initial submission to BRS portal",
        });

      expect(govRes.status).toBe(201);
      testGovAppId = govRes.body.data.id;
      expect(govRes.body.data.platform).toBe("BRS");
      expect(govRes.body.data.status).toBe("SUBMITTED");
    });

    it("A2. Government queries submission -> triggers client action and pauses SLA", async () => {
      const queryRes = await request(app)
        .post(`/api/v1/admin/government-applications/${testGovAppId}/request-info`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          queryType: "ADDITIONAL_DOCUMENTS",
          queryDetails: "BRS officer requests verified KRA PIN of second director",
          deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          actionItemTitle: "Upload Second Director KRA PIN Certificate",
          actionItemDescription: "Please provide the KRA PIN certificate for the second director.",
        });

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.governmentApplication.status).toBe("ADDITIONAL_INFORMATION_REQUIRED");
      expect(queryRes.body.data.clientAction).toBeDefined();
      expect(queryRes.body.data.clientAction.type).toBe("PROVIDE_INFORMATION");
      testClientActionId = queryRes.body.data.clientAction.id;

      // Verify application SLA is paused with CLIENT_WAITING category
      const appRecord = await prisma.application.findUnique({
        where: { id: testAppId },
      });
      expect(appRecord?.pausedAt).not.toBeNull();

      const slaEvent = await prisma.applicationSlaEvent.findFirst({
        where: { applicationId: testAppId, category: "CLIENT_WAITING" },
      });
      expect(slaEvent).toBeDefined();
    });

    it("A3. Client completes action -> resumes SLA and admin resubmits", async () => {
      // Client views open actions
      const openActions = await request(app)
        .get("/api/v1/client/actions/open")
        .set("Authorization", `Bearer ${clientToken}`);

      expect(openActions.status).toBe(200);
      expect(openActions.body.data.some((a: any) => a.id === testClientActionId)).toBe(true);

      // Client completes the action
      const completeRes = await request(app)
        .post(`/api/v1/actions/${testClientActionId}/complete`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          responseNotes: "Uploaded verified KRA PIN certificate for Jane Doe",
          responseData: { kraPin: "A009876543Z" },
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.updatedAction.status).toBe("COMPLETED");

      // Verify SLA is resumed on Application
      const appRecord = await prisma.application.findUnique({
        where: { id: testAppId },
      });
      expect(appRecord?.pausedAt).toBeNull();

      // Admin resubmits to government
      const resubmitRes = await request(app)
        .post(`/api/v1/admin/government-applications/${testGovAppId}/resubmit`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          notes: "Resubmitted with verified KRA PIN of second director",
          newReference: "BRS-APP-2026-X99-R1",
        });

      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe("RESUBMITTED");
    });

    it("A4. Government records approval and certificate clearance", async () => {
      const approveRes = await request(app)
        .post(`/api/v1/admin/government-applications/${testGovAppId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          officialDocumentNumber: "CPR/2026/88990",
          approvalNotes: "Certificate of Incorporation issued by Registrar of Companies",
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe("APPROVED");
    });
  });

  describe("Scenario B: Document Review Rejection & Replacement Flow", () => {
    it("B1. Client uploads document and Admin rejects with replacement request", async () => {
      const uploadRes = await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          applicationId: testAppId,
          documentType: "NATIONAL_ID",
          title: "National ID Copy",
          fileName: "id_copy.pdf",
          mimeType: "application/pdf",
          base64Data: Buffer.from("Sample ID content").toString("base64"),
        });

      expect(uploadRes.status).toBe(201);
      testDocId = uploadRes.body.data.id;

      // Admin reviews and rejects document
      const reviewRes = await request(app)
        .patch(`/api/v1/documents/${testDocId}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "REJECTED",
          reviewNotes: "Document is blurry and corners are cropped out. Please re-scan clearly.",
          requestReplacement: true,
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe("REJECTED");

      // Verify ClientAction created for replacement
      const actions = await prisma.clientAction.findMany({
        where: { applicationId: testAppId, type: "REPLACE_DOCUMENT" },
      });
      expect(actions.length).toBeGreaterThan(0);
    });

    it("B2. Client completes replacement action and unpauses SLA", async () => {
      const action = await prisma.clientAction.findFirst({
        where: { applicationId: testAppId, type: "REPLACE_DOCUMENT", status: "OPEN" },
      });

      if (action) {
        const compRes = await request(app)
          .post(`/api/v1/actions/${action.id}/complete`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            responseNotes: "Uploaded clear high-res scan",
          });
        expect(compRes.status).toBe(200);
      }
    });
  });

  describe("Scenario C: SLA Timing Pause/Resume & Timeline Audit", () => {
    it("C1. Admin pauses SLA for government delay and resumes", async () => {
      // Pause SLA
      const pauseRes = await request(app)
        .post(`/api/v1/admin/applications/${testAppId}/sla/pause`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reason: "BRS Portal undergoing scheduled maintenance",
          category: "GOVERNMENT_WAITING",
        });

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.pausedAt).not.toBeNull();

      // Resume SLA
      const resumeRes = await request(app)
        .post(`/api/v1/admin/applications/${testAppId}/sla/resume`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reason: "BRS Portal back online",
        });

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.pausedAt).toBeNull();

      // Get SLA Timeline
      const timelineRes = await request(app)
        .get(`/api/v1/applications/${testAppId}/sla-timeline`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(timelineRes.status).toBe(200);
      expect(timelineRes.body.data.events.length).toBeGreaterThan(0);
    });
  });

  describe("Scenario D: Work Queue, Priority Management & Application Closure", () => {
    it("D1. Queries comprehensive work queue with live buckets", async () => {
      const queueRes = await request(app)
        .get("/api/v1/admin/applications/work-queue")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(queueRes.status).toBe(200);
      expect(queueRes.body.data).toBeDefined();
      expect(queueRes.body.buckets).toBeDefined();
      expect(queueRes.body.buckets.totalActive).toBeGreaterThan(0);
    });

    it("D2. Updates application priority and closes application", async () => {
      // Update priority to URGENT
      const priorityRes = await request(app)
        .patch(`/api/v1/admin/applications/${testAppId}/priority`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          priority: "URGENT",
          reason: "Client requested executive expedited processing",
        });

      expect(priorityRes.status).toBe(200);
      expect(priorityRes.body.data.priority).toBe("URGENT");

      // Formally close application
      const closeRes = await request(app)
        .post(`/api/v1/admin/applications/${testAppId}/close`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reason: "All documents delivered and client signed receipt",
          completionNotes: "Delivered via express courier",
        });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe("CLOSED");
    });
  });

  describe("Scenario E: Notification Preferences & Background Job Sweeps", () => {
    it("E1. Updates client notification preferences", async () => {
      const prefRes = await request(app)
        .patch("/api/v1/client/notifications/preferences")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          emailEnabled: true,
          smsEnabled: true,
          inAppEnabled: true,
          marketingEnabled: false,
        });

      expect(prefRes.status).toBe(200);
      expect(prefRes.body.data.emailEnabled).toBe(true);
      expect(prefRes.body.data.marketingEnabled).toBe(false);
    });

    it("E2. Executes full scheduled background sweeps without errors", async () => {
      const sweepResults = await jobQueueService.runAllScheduledSweeps(orgId);
      expect(sweepResults).toBeDefined();
      expect(sweepResults.sla).toBeDefined();
      expect(sweepResults.government).toBeDefined();
      expect(sweepResults.clientActions).toBeDefined();
      expect(sweepResults.documentExpiry).toBeDefined();
    });
  });
});
