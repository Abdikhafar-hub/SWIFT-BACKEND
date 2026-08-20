import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Auth Integration Tests", () => {
  const testEmail = `test.user.${Date.now()}@example.com`;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // Ensure database connection
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup created test user & client
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it("POST /api/v1/auth/register creates a new Client and returns tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Test Citizen Registration",
        email: testEmail,
        phone: "+254799112233",
        password: "StrongPassword123!",
        clientType: "INDIVIDUAL",
        nationalId: "39482710",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.client.clientNumber).toMatch(/^SD-CL-\d{6}$/);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it("POST /api/v1/auth/login authenticates with valid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "StrongPassword123!",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it("GET /api/v1/auth/me returns the authenticated user and client profile", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body.data.clientProfile.nationalId).toBe("39482710");
  });

  it("POST /api/v1/auth/refresh rotates the refresh token and returns new tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
  });

  it("POST /api/v1/auth/forgot-password sends reset instructions for existing email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: testEmail });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain("password reset link");
  });

  it("POST /api/v1/auth/forgot-password gracefully handles non-existent email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nonexistent.user999@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/v1/auth/reset-password rejects invalid token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: "invalid-token-12345",
        newPassword: "BrandNewPassword123!",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/v1/auth/change-password updates password for authenticated user", async () => {
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "StrongPassword123!",
        newPassword: "BrandNewPassword123!",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify login with new password succeeds
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "BrandNewPassword123!",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });

  it("POST /api/v1/auth/reset-password successfully resets password with valid token", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    const jwt = (await import("jsonwebtoken")).default;
    const { env } = await import("../../src/config/env.js");

    const validToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        purpose: "PASSWORD_RESET",
      },
      env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: validToken,
        newPassword: "ResetCompletelyNew999!",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain("successfully reset");

    // Verify login with final new password succeeds
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "ResetCompletelyNew999!",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });
});


