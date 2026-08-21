import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

describe("Admin Account Settings Integration Tests", () => {
  const testAdminEmail = `admin.settings.${Date.now()}@swiftdoc.co.ke`;
  const targetEmail = `admin.newemail.${Date.now()}@swiftdoc.co.ke`;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: "swift-doc" } });
    const passwordHash = await bcrypt.hash("AdminPassword123!", 10);

    const admin = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: testAdminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
        firstName: "System",
        lastName: "Admin",
        jobTitle: "Operations Lead",
        department: "Filing Operations",
      },
    });

    adminId = admin.id;

    // Login to obtain JWT
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testAdminEmail,
        password: "AdminPassword123!",
      });

    adminToken = loginRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Delete test accounts
    await prisma.user.deleteMany({
      where: {
        email: { in: [testAdminEmail, targetEmail] },
      },
    });
    await prisma.$disconnect();
  });

  it("GET /api/v1/admin/account/profile fetches admin profile details", async () => {
    const res = await request(app)
      .get("/api/v1/admin/account/profile")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testAdminEmail);
    expect(res.body.data.firstName).toBe("System");
    expect(res.body.data.lastName).toBe("Admin");
    expect(res.body.data.jobTitle).toBe("Operations Lead");
  });

  it("PATCH /api/v1/admin/account/profile updates profile fields", async () => {
    const res = await request(app)
      .patch("/api/v1/admin/account/profile")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        firstName: "Chief",
        lastName: "Administrator",
        jobTitle: "Director of Compliance",
        phone: "+254711002233",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe("Chief");
    expect(res.body.data.lastName).toBe("Administrator");
    expect(res.body.data.jobTitle).toBe("Director of Compliance");
    expect(res.body.data.phone).toBe("+254711002233");
  });

  it("POST /api/v1/admin/account/profile-image uploads base64 profile image", async () => {
    const sampleBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await request(app)
      .post("/api/v1/admin/account/profile-image")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        fileName: "avatar.png",
        mimeType: "image/png",
        base64Data: sampleBase64,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBeDefined();
    expect(res.body.data.user.avatarUrl).toBe(res.body.data.avatarUrl);
  });

  it("DELETE /api/v1/admin/account/profile-image removes profile image", async () => {
    const res = await request(app)
      .delete("/api/v1/admin/account/profile-image")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBeNull();
  });

  it("POST /api/v1/admin/account/change-password validates current password and updates hash", async () => {
    // Incorrect password attempt
    const failRes = await request(app)
      .post("/api/v1/admin/account/change-password")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        currentPassword: "WrongPassword123!",
        newPassword: "NewAdminPassword123!",
        confirmNewPassword: "NewAdminPassword123!",
      });

    expect(failRes.status).toBe(401);

    // Correct password attempt
    const successRes = await request(app)
      .post("/api/v1/admin/account/change-password")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        currentPassword: "AdminPassword123!",
        newPassword: "NewAdminPassword123!",
        confirmNewPassword: "NewAdminPassword123!",
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
  });

  it("Full Email Change Workflow (Request OTP -> Verify OTP)", async () => {
    // 1. Request Email Change
    const reqRes = await request(app)
      .post("/api/v1/admin/account/request-email-change")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        currentPassword: "NewAdminPassword123!",
        newEmail: targetEmail,
      });

    expect(reqRes.status).toBe(200);
    expect(reqRes.body.success).toBe(true);
    expect(reqRes.body.data.pendingEmail).toBe(targetEmail);

    // Fetch user from db to retrieve OTP hash for verification test
    const userInDb = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(userInDb.pendingEmail).toBe(targetEmail);
    expect(userInDb.pendingEmailOtpHash).toBeDefined();

    // 2. Verify with invalid OTP code
    const invalidRes = await request(app)
      .post("/api/v1/admin/account/verify-email-change")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "000000" });

    expect(invalidRes.status).toBe(400);

    // 3. Manually construct matching OTP for verification test
    const testOtp = "123456";
    const testOtpHash = await bcrypt.hash(testOtp, 10);
    await prisma.user.update({
      where: { id: adminId },
      data: { pendingEmailOtpHash: testOtpHash },
    });

    const verifyRes = await request(app)
      .post("/api/v1/admin/account/verify-email-change")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: testOtp });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.user.email).toBe(targetEmail);
  });

  it("GET & PATCH /api/v1/admin/account/notification-preferences", async () => {
    const getRes = await request(app)
      .get("/api/v1/admin/account/notification-preferences")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.emailOperationalAlerts).toBe(true);

    const patchRes = await request(app)
      .patch("/api/v1/admin/account/notification-preferences")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        emailOperationalAlerts: false,
        emailSlaAlerts: false,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.emailOperationalAlerts).toBe(false);
    expect(patchRes.body.data.emailSlaAlerts).toBe(false);
  });
});
