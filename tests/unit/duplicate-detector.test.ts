import { describe, it, expect, vi } from "vitest";
import { detectDuplicateClient } from "../../src/common/utils/duplicate-detector.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Client Duplicate Detection Engine", () => {
  it("detects high-confidence duplicate when National ID or Passport matches", async () => {
    vi.spyOn(prisma.client, "findMany").mockResolvedValueOnce([
      {
        id: "client-existing-1",
        clientNumber: "SD-CL-000001",
        fullName: "John Kamau",
        email: "john.kamau@example.com",
        phone: "+254712345678",
        nationalId: "28491023",
        passportNumber: null,
        kraPin: "A009182736P",
        businessName: null,
      } as any,
    ]);

    const result = await detectDuplicateClient({
      organizationId: "org-1",
      nationalId: "28491023",
      email: "new.email@example.com",
    });

    expect(result.isDuplicateFound).toBe(true);
    expect(result.confidence).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.reasons[0]).toContain("Exact National ID match");
  });

  it("returns NONE confidence when no matching attributes exist", async () => {
    vi.spyOn(prisma.client, "findMany").mockResolvedValueOnce([]);

    const result = await detectDuplicateClient({
      organizationId: "org-1",
      nationalId: "99999999",
      email: "brand.new@example.com",
      phone: "+254700000000",
    });

    expect(result.isDuplicateFound).toBe(false);
    expect(result.confidence).toBe("NONE");
    expect(result.score).toBe(0);
    expect(result.matchedClientIds).toHaveLength(0);
  });
});
