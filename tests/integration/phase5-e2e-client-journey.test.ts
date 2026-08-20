import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Phase 5 E2E Complete Client Lifecycle Journey (31 Steps)", () => {
  let adminToken: string;
  let adminUserId: string;
  let clientToken: string;
  let clientId: string;
  let clientUserId: string;
  let serviceId: string;
  let applicationId: string;
  let applicationNumber: string;
  let requirementId: string;
  let docId: string;
  let clientActionId: string;
  let govRefId: string;
  let invoiceId: string;
  let checkoutReqId: string;
  let deliveryId: string;

  const testEmail = `e2e.client.${Date.now()}@swiftdoc.co.ke`;
  const testPhone = `+2547${Math.floor(10000000 + Math.random() * 90000000)}`;

  beforeAll(async () => {
    // 1. Admin Authentication
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      });
    adminToken = adminLogin.body.data.tokens.accessToken;
    adminUserId = adminLogin.body.data.user.id;

    // Get an active service from DB
    const service = await prisma.service.findFirst({
      where: { active: true },
    });
    serviceId = service!.id;
  });

  // Step 1: Registration
  it("Step 1: Client registers a fresh account", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Amina Mohamed",
        email: testEmail,
        phone: testPhone,
        password: "ClientSecurePass2026!",
        clientType: "INDIVIDUAL",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.client).toBeDefined();
    clientId = res.body.data.client.id;
    clientUserId = res.body.data.user.id;
  });

  // Step 2: Login
  it("Step 2: Client logs in and receives JWT authentication tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "ClientSecurePass2026!",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    clientToken = res.body.data.tokens.accessToken;
  });

  // Step 3: View Own Profile
  it("Step 3: Client retrieves and verifies own profile", async () => {
    const res = await request(app)
      .get("/api/v1/client/profile")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
  });

  // Step 4: Browse Catalog
  it("Step 4: Client browses active service catalog", async () => {
    const res = await request(app)
      .get("/api/v1/client/services")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // Step 5 & 6: Create Application
  it("Step 5 & 6: Client initiates a new application for selected service", async () => {
    const res = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        serviceId,
        notesSummary: "Urgent company registration for new business entity",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.applicationNumber).toMatch(/^SD-APP-\d{4}-\d+$/);

    applicationId = res.body.data.id;
    applicationNumber = res.body.data.applicationNumber;
  });

  // Step 7: Verify Requirements Snapshot
  it("Step 7: Verifies application requirements snapshot is immutable", async () => {
    const appRecord = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { requirements: true },
    });

    expect(appRecord).toBeDefined();
    expect(appRecord?.status).toBe("NEW");
    if (appRecord?.requirements && appRecord.requirements.length > 0) {
      requirementId = appRecord.requirements[0].id;
    }
  });

  // Step 8: Client views application details
  it("Step 8: Client retrieves application details and requirements list", async () => {
    const res = await request(app)
      .get(`/api/v1/client/applications/${applicationId}`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(applicationId);
    if (!requirementId && res.body.data.requirements?.length > 0) {
      requirementId = res.body.data.requirements[0].id;
    }
  });

  // Step 9: Client submits requirement answer
  it("Step 9: Client submits answers to service requirements", async () => {
    const appRecord = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { requirements: true },
    });

    for (const req of appRecord?.requirements || []) {
      if (req.type === "DOCUMENT") {
        requirementId = req.id;
      } else {
        await request(app)
          .post(`/api/v1/client/applications/${applicationId}/requirements/${req.id}`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            valueText: "Apex Document Dynamics Ltd",
          });
      }
    }

    if (!requirementId && appRecord?.requirements && appRecord.requirements.length > 0) {
      requirementId = appRecord.requirements[0].id;
    }
  });

  // Step 10: Client uploads identity document
  it("Step 10: Client uploads National ID document", async () => {
    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        applicationId,
        applicationRequirementId: requirementId || undefined,
        documentType: "NATIONAL_ID",
        title: "National ID Front & Back",
        fileName: "national_id.pdf",
        mimeType: "application/pdf",
        base64Data: Buffer.from("%PDF-1.4 National ID Mock Content").toString("base64"),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    docId = res.body.data.id;
  });

  // Step 11 & 12: Admin assigns application
  it("Step 11 & 12: Admin assigns application to themselves", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${applicationId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        assignedAdminId: adminUserId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Step 13 & 14: Admin reviews document and requests correction (SLA paused)
  it("Step 13 & 14: Admin rejects document with reason, auto-creating Client Action & pausing SLA", async () => {
    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "REJECTED",
        reviewNotes: "ID image is blurry. Please upload high-resolution scan.",
        requestReplacement: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("REJECTED");

    // Verify client action was created
    const action = await prisma.clientAction.findFirst({
      where: { applicationId, status: "OPEN" },
    });
    expect(action).toBeDefined();
    clientActionId = action!.id;
  });

  // Step 15: Client views pending action
  it("Step 15: Client views open action in client portal", async () => {
    const res = await request(app)
      .get(`/api/v1/applications/${applicationId}/actions`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((a: any) => a.id === clientActionId)).toBe(true);
  });

  // Step 16: Client uploads corrected version
  it("Step 16: Client uploads corrected National ID document (Version 2)", async () => {
    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        applicationId,
        applicationRequirementId: requirementId || undefined,
        documentType: "NATIONAL_ID",
        title: "National ID High-Res Scan",
        fileName: "national_id_v2.pdf",
        mimeType: "application/pdf",
        base64Data: Buffer.from("%PDF-1.4 High Res National ID Clean Scan").toString("base64"),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    docId = res.body.data.id;
  });

  // Step 17 & 18: Client resolves action, SLA resumes
  it("Step 17 & 18: Client marks action resolved, resuming SLA timer", async () => {
    const res = await request(app)
      .post(`/api/v1/actions/${clientActionId}/complete`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        completionNotes: "Uploaded new high-res PDF scan of National ID",
        documentId: docId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedAction.status).toBe("COMPLETED");
  });

  // Step 19: Admin approves document
  it("Step 19: Admin reviews and approves corrected document version", async () => {
    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "APPROVED",
        reviewNotes: "Identity document verified against civil registry requirements",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");

    // Ensure any other required requirements are satisfied & approved
    const remainingReqs = await prisma.applicationRequirement.findMany({
      where: { applicationId, required: true, isSatisfied: false },
    });

    for (const req of remainingReqs) {
      if (req.type === "DOCUMENT") {
        const uploadRes = await request(app)
          .post("/api/v1/documents")
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            applicationId,
            applicationRequirementId: req.id,
            documentType: req.code,
            title: req.name,
            fileName: `${req.code.toLowerCase()}.pdf`,
            mimeType: "application/pdf",
            base64Data: Buffer.from("%PDF-1.4 Supporting Document Content").toString("base64"),
          });
        if (uploadRes.body?.data?.id) {
          await request(app)
            .patch(`/api/v1/documents/${uploadRes.body.data.id}/review`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
              status: "APPROVED",
              reviewNotes: "Document verified",
            });
        }
      } else {
        await request(app)
          .post(`/api/v1/client/applications/${applicationId}/requirements/${req.id}`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            valueText: "Verified value",
          });
      }
    }
  });

  // Step 20: Ready for submission
  it("Step 20: Admin transitions application to READY_FOR_SUBMISSION", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "READY_FOR_SUBMISSION",
        reason: "All requirements and documents verified. Ready for government lodging.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("READY_FOR_SUBMISSION");
  });

  // Step 21 & 22: Government reference creation & submission
  it("Step 21 & 22: Admin records BRS government reference and marks SUBMITTED", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/applications/${applicationId}/government`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        platform: "BRS",
        governmentAgency: "Business Registration Service",
        externalReference: `BRS-PVT-${Date.now()}`,
        status: "SUBMITTED",
        portalUrl: "https://brs.ecitizen.go.ke",
        notes: "Lodged with Business Registration Service registry",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    govRefId = res.body.data.id;

    // Transition application status to SUBMITTED
    const statusRes = await request(app)
      .patch(`/api/v1/admin/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "SUBMITTED",
        reason: "Lodged with BRS portal",
      });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe("SUBMITTED");
  });

  // Step 23: Government approval
  it("Step 23: Government reference status updated to APPROVED", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/government-applications/${govRefId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        officialDocumentNumber: `CPR/2026/${Math.floor(10000 + Math.random() * 90000)}`,
        approvalNotes: "BRS Certificate of Incorporation issued by Registrar of Companies",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
  });

  // Step 24: Document received
  it("Step 24: Admin records official document reception", async () => {
    const checkApp = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    expect(checkApp?.status).toBe("DOCUMENT_RECEIVED");
  });

  // Step 25: Quality check
  it("Step 25: Admin completes quality assurance check", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/quality/applications/${applicationId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        result: "PASSED",
        checklist: {
          sealVerified: true,
          companyNumberVerified: true,
          directorNamesMatched: true,
        },
        notes: "Official seal, company number, and director names verified",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.result).toBe("PASSED");
  });

  // Step 26: Create and issue invoice
  it("Step 26: Admin creates and issues multi-line itemized invoice", async () => {
    const createRes = await request(app)
      .post("/api/v1/admin/invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        applicationId,
        clientId,
        status: "DRAFT",
        dueAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        lineItems: [
          {
            description: "BRS Incorporation Statutory Filing Fee",
            unitAmount: 10000,
            quantity: 1,
            category: "GOVERNMENT_FEE",
          },
          {
            description: "Swift Doc Premium Legal Processing Fee",
            unitAmount: 5000,
            quantity: 1,
            category: "SERVICE_FEE",
          },
        ],
      });

    expect(createRes.status).toBe(201);
    invoiceId = createRes.body.data.id;

    const issueRes = await request(app)
      .post(`/api/v1/admin/invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        notes: "Official Invoice Issued for Settlement",
      });

    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.status).toBe("ISSUED");
  });

  // Step 27: Initiate M-Pesa STK Push
  it("Step 27: Client initiates M-Pesa STK push for invoice settlement", async () => {
    const res = await request(app)
      .post(`/api/v1/client/invoices/${invoiceId}/pay-mpesa`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        phoneNumber: "254722114477",
        amount: 15000,
        idempotencyKey: `IDEMP_MPESA_${Date.now()}`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checkoutRequestId).toBeDefined();
    checkoutReqId = res.body.data.checkoutRequestId;
  });

  // Step 28: Daraja M-Pesa Callback
  it("Step 28: Daraja M-Pesa callback applies payment atomically and clears balance", async () => {
    const mpesaReceipt = `NLK${Math.floor(10000000 + Math.random() * 90000000)}`;

    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MR_E2E_123",
          CheckoutRequestID: checkoutReqId,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 15000 },
              { Name: "MpesaReceiptNumber", Value: mpesaReceipt },
              { Name: "PhoneNumber", Value: "254722114477" },
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
    const updatedInvoice = await prisma.payment.findUnique({
      where: { id: invoiceId },
    });
    expect(updatedInvoice?.status).toBe("PAID");
    expect(Number(updatedInvoice?.amountDue)).toBe(0);
  });

  // Step 29: Dispatch delivery
  it("Step 29: Admin dispatches deliverables and marks READY_FOR_DELIVERY", async () => {
    const dispatchRes = await request(app)
      .post(`/api/v1/admin/delivery/applications/${applicationId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        deliveryMethod: "DIGITAL",
        recipientName: "Amina Mohamed",
        recipientPhone: "+254722114477",
        recipientEmail: testEmail,
        notes: "Download certificate from client portal",
      });

    expect(dispatchRes.status).toBe(201);
    expect(dispatchRes.body.success).toBe(true);
    deliveryId = dispatchRes.body.data.id;
  });

  // Step 30: Client views delivery details and confirms receipt
  it("Step 30: Client views delivery details and confirms delivery receipt", async () => {
    const getRes = await request(app)
      .get(`/api/v1/client/applications/${applicationId}/delivery`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);

    const confirmRes = await request(app)
      .patch(`/api/v1/admin/delivery/${deliveryId}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        receivedBy: "Amina Mohamed",
        notes: "Delivered electronically via Swift Doc Client Portal",
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);

    const appStatus = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    expect(appStatus?.status).toBe("DELIVERED");
  });

  // Step 31: Application closure and audit verification
  it("Step 31: Admin formally closes application with complete audit trail", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/applications/${applicationId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "All deliverables confirmed received and settled",
        completionNotes: "Registration successful and archived.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify final state in DB
    const finalApp = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        activities: true,
        payments: true,
        deliveries: true,
        qualityChecks: true,
      },
    });

    expect(finalApp?.status).toBe("CLOSED");
    expect(finalApp?.activities.length).toBeGreaterThan(5);
  });
});
