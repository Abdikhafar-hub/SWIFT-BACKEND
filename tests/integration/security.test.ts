import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Security, RBAC & Data Isolation Tests", () => {
  let clientAToken: string;
  let clientBToken: string;
  let clientAAppId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Register Client A
    const resA = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Security Client Alpha",
        email: `client.alpha.${Date.now()}@example.com`,
        phone: "+254711000111",
        password: "Password123!",
      });

    clientAToken = resA.body.data.tokens.accessToken;

    // Register Client B
    const resB = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Security Client Beta",
        email: `client.beta.${Date.now()}@example.com`,
        phone: "+254711000222",
        password: "Password123!",
      });

    clientBToken = resB.body.data.tokens.accessToken;

    // Fetch a service
    const service = await prisma.service.findFirst({ where: { code: "SRV-BR-001" } });

    // Client A creates an application
    const appA = await request(app)
      .post("/api/v1/client/applications")
      .set("Authorization", `Bearer ${clientAToken}`)
      .send({
        serviceId: service!.id,
        notesSummary: "Confidential Alpha Application",
      });

    clientAAppId = appA.body.data.id;
  });

  afterAll(async () => {
    if (clientAAppId) {
      await prisma.application.delete({ where: { id: clientAAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("rejects unauthenticated requests to protected endpoints with 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/client/profile");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("blocks CLIENT accounts from accessing ADMIN endpoints with 403 FORBIDDEN", async () => {
    const res = await request(app)
      .get("/api/v1/admin/clients")
      .set("Authorization", `Bearer ${clientAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("enforces cross-client data isolation: Client B cannot view Client A's application", async () => {
    const res = await request(app)
      .get(`/api/v1/client/applications/${clientAAppId}`)
      .set("Authorization", `Bearer ${clientBToken}`);

    // Application is scoped to the requesting client's ID, returning 404 NOT_FOUND to prevent resource enumeration
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
