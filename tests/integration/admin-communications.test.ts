import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Admin ↔ Client Communications Multi-Channel E2E Certification", () => {
  let adminToken: string;
  let clientToken: string;
  let clientUser: any;
  let adminUser: any;
  let applicationId: string;

  beforeAll(async () => {
    // 1. Register Client User
    const clientEmail = `comm.client.${Date.now()}@swiftdoc.test`;
    const clientReg = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Communication Test Client",
        email: clientEmail,
        phone: "+254700111222",
        password: "ClientPassword123!",
      });

    expect(clientReg.status).toBe(201);
    clientToken = clientReg.body.data.tokens.accessToken;
    clientUser = await prisma.user.findUnique({ where: { email: clientEmail } });

    // Create application for client
    const clientProfile = await prisma.client.findFirst({ where: { userId: clientUser.id } });
    const service = await prisma.service.findFirst();
    if (!service) throw new Error("No service found in DB");

    const newApp = await prisma.application.create({
      data: {
        organizationId: clientUser.organizationId,
        clientId: clientProfile!.id,
        serviceId: service.id,
        applicationNumber: `SD-APP-TEST-${Date.now().toString().slice(-6)}`,
        status: "SUBMITTED",
      },
    });
    applicationId = newApp.id;

    // 2. Register Admin Officer
    const adminReg = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Admin Officer",
        email: `admin.officer.${Date.now()}@swiftdoc.test`,
        phone: "+254799000111",
        password: "AdminPassword123!",
      });
    
    adminToken = adminReg.body.data.tokens.accessToken;
    adminUser = await prisma.user.findUnique({ where: { email: adminReg.body.data.user.email } });
    await prisma.user.update({ where: { id: adminUser!.id }, data: { role: "ADMIN" } });
  });

  afterAll(async () => {
    if (applicationId) {
      await prisma.applicationMessage.deleteMany({ where: { applicationId } });
      await prisma.notification.deleteMany({ where: { applicationId } });
      await prisma.application.delete({ where: { id: applicationId } });
    }
    if (clientUser) {
      await prisma.refreshToken.deleteMany({ where: { userId: clientUser.id } });
      await prisma.client.deleteMany({ where: { userId: clientUser.id } });
      await prisma.user.delete({ where: { id: clientUser.id } });
    }
    if (adminUser) {
      await prisma.refreshToken.deleteMany({ where: { userId: adminUser.id } });
      await prisma.client.deleteMany({ where: { userId: adminUser.id } });
      await prisma.user.delete({ where: { id: adminUser.id } });
    }
  });

  it("1. Admin dispatches message to client application via API", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/messages/${applicationId}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        applicationId,
        subject: "Direct Multi-Channel Compliance Directive",
        message: "Please upload your updated business permit for verification.",
        channel: "IN_APP",
        sendEmail: true,
        sendSms: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain("business permit");
  });

  it("2. Client fetches message thread in Officer Messages Hub", async () => {
    const res = await request(app)
      .get(`/api/v1/client/messages/threads?folder=inbox`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const thread = res.body.data.find((t: any) => t.applicationId === applicationId);
    expect(thread).toBeDefined();
    expect(thread.lastSenderRole).toBe("ADMIN");
  });

  it("3. Client replies to Admin dispatch", async () => {
    const res = await request(app)
      .post(`/api/v1/client/messages/${applicationId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        applicationId,
        message: "Permit uploaded to vault. Please verify.",
        channel: "IN_APP",
        sendEmail: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.senderRole).toBe("CLIENT");
  });

  it("4. Admin fetches thread and confirms Client reply is present", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/messages/threads?folder=inbox`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const thread = res.body.data.find((t: any) => t.applicationId === applicationId);
    expect(thread).toBeDefined();
    expect(thread.lastMessageSnippet).toContain("uploaded to vault");
  });
});
