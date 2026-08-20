import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Service Catalog Integration Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /api/v1/client/services returns all service categories and their services", async () => {
    const res = await request(app).get("/api/v1/client/services");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const businessReg = res.body.data.find((c: any) => c.code === "CAT-BR");
    expect(businessReg).toBeDefined();
    expect(businessReg.services.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/client/services/:slug returns detailed service with requirements", async () => {
    const res = await request(app).get("/api/v1/client/services/company-incorporation");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe("SRV-BR-001");
    expect(res.body.data.requirements.length).toBeGreaterThan(0);
    expect(res.body.data.requirements[0].code).toBeDefined();
  });
});
