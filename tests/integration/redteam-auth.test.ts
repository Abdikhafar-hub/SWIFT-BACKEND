import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { env } from "../../src/config/env.js";
import { UserRole } from "@prisma/client";

describe("Red-Team Security & Auth Lifecycle Audit Suite", () => {
  let testUser: any;
  let accessToken: string;
  let refreshCookie: string;
  let rawRefreshToken: string;
  let sessionId: string;

  beforeAll(async () => {
    const email = `redteam.user.${Date.now()}@swiftdoc.test`;
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "RedTeam Tester",
        email,
        phone: "+254711999888",
        password: "SecurePassword123!",
      });

    expect(regRes.status).toBe(201);
    accessToken = regRes.body.data.tokens.accessToken;

    const cookieHeader = regRes.headers["set-cookie"];
    expect(cookieHeader).toBeDefined();
    refreshCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    rawRefreshToken = regRes.body.data.tokens.refreshToken;

    const payload: any = jwt.decode(accessToken);
    sessionId = payload.sessionId;
    expect(sessionId).toBeDefined();

    testUser = await prisma.user.findUnique({ where: { email } });
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.refreshToken.deleteMany({ where: { userId: testUser.id } });
      await prisma.client.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
  });

  it("1. Verifies immediate session revocation upon logout (Session Binding)", async () => {
    // Perform logout
    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", [refreshCookie]);

    expect(logoutRes.status).toBe(200);

    // Attempt to access protected endpoint using previous access token
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(meRes.status).toBe(401);
    expect(meRes.body.error.message).toMatch(/revoked|signed out/i);
  });

  it("2. Verifies token reuse detection revokes entire token family", async () => {
    // 1. Re-login to get fresh token pair A
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testUser.email,
        password: "SecurePassword123!",
      });

    expect(loginRes.status).toBe(200);
    const cookieA = loginRes.headers["set-cookie"][0];
    const tokenA = loginRes.body.data.tokens.refreshToken;

    // 2. Perform legitimate refresh -> receive token pair B
    const refresh1Res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [cookieA]);

    expect(refresh1Res.status).toBe(200);
    const cookieB = refresh1Res.headers["set-cookie"][0];
    const accessTokenB = refresh1Res.body.data.tokens.accessToken;

    // 3. Attempt reuse of token A (Attack Simulation)
    const reuseRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [cookieA]);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.message).toMatch(/reuse detected/i);

    // 4. Verify legitimate token B is now ALSO revoked (Family-wide Revocation)
    const refresh2Res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [cookieB]);

    expect(refresh2Res.status).toBe(401);

    // 5. Verify access token B is rejected server-side
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessTokenB}`);

    expect(meRes.status).toBe(401);
  });

  it("3. Verifies 5-minute server-side idle timeout enforcement", async () => {
    // 1. Re-login to get new session
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testUser.email,
        password: "SecurePassword123!",
      });

    const currentAccessToken = loginRes.body.data.tokens.accessToken;
    const payload: any = jwt.decode(currentAccessToken);

    // 2. Manually set lastActivityAt to 5 minutes 5 seconds ago in database
    const fiveMinAgo = new Date(Date.now() - (5 * 60 * 1000 + 5000));
    await prisma.refreshToken.updateMany({
      where: { sessionId: payload.sessionId },
      data: { lastActivityAt: fiveMinAgo, createdAt: fiveMinAgo },
    });

    // 3. Request protected endpoint -> must be rejected with 401
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${currentAccessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/5-minute inactivity/i);
  });

  it("4. Prevents bypassing 5-minute idle timeout via pingSession", async () => {
    // 1. Re-login
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testUser.email,
        password: "SecurePassword123!",
      });

    const currentAccessToken = loginRes.body.data.tokens.accessToken;
    const payload: any = jwt.decode(currentAccessToken);

    // 2. Simulate 6 minutes of inactivity
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.refreshToken.updateMany({
      where: { sessionId: payload.sessionId },
      data: { lastActivityAt: sixMinAgo, createdAt: sixMinAgo },
    });

    // 3. Send /auth/ping request -> must fail with 401 instead of renewing
    const pingRes = await request(app)
      .post("/api/v1/auth/ping")
      .set("Authorization", `Bearer ${currentAccessToken}`);

    expect(pingRes.status).toBe(401);
    expect(pingRes.body.error.message).toMatch(/inactivity/i);
  });

  it("5. Verifies absolute session lifetime expiration (12 hours)", async () => {
    // 1. Re-login
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testUser.email,
        password: "SecurePassword123!",
      });

    const currentAccessToken = loginRes.body.data.tokens.accessToken;
    const payload: any = jwt.decode(currentAccessToken);

    // 2. Manually set absoluteExpiresAt to 1 second ago in database
    const pastDate = new Date(Date.now() - 1000);
    await prisma.refreshToken.updateMany({
      where: { sessionId: payload.sessionId },
      data: { absoluteExpiresAt: pastDate },
    });

    // 3. Send request -> must be rejected due to absolute expiration
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${currentAccessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/absolute lifetime expired/i);
  });

  it("6. Rejects forged or malformed JWT claims (missing sessionId, wrong issuer)", async () => {
    // Token without sessionId
    const badTokenNoSession = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      env.JWT_SECRET,
      { expiresIn: "15m", issuer: "swiftdoc.co.ke", audience: "swiftdoc-app" }
    );

    const res1 = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${badTokenNoSession}`);

    expect(res1.status).toBe(401);
    expect(res1.body.error.message).toMatch(/missing session context/i);

    // Token with wrong issuer
    const badTokenWrongIssuer = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role, sessionId: "dummy" },
      env.JWT_SECRET,
      { expiresIn: "15m", issuer: "evil-issuer.com", audience: "swiftdoc-app" }
    );

    const res2 = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${badTokenWrongIssuer}`);

    expect(res2.status).toBe(401);

    // Token with altered role (Role Escalation Attempt)
    const forgedAdminToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: UserRole.ADMIN, sessionId: "dummy" },
      "WRONG_SECRET_KEY_123",
      { expiresIn: "15m", issuer: "swiftdoc.co.ke", audience: "swiftdoc-app" }
    );

    const res3 = await request(app)
      .get("/api/v1/admin/dashboard/metrics")
      .set("Authorization", `Bearer ${forgedAdminToken}`);

    expect(res3.status).toBe(401);
  });
});
