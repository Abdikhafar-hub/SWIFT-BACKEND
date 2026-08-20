import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateClientNumber,
  generateApplicationNumber,
  generateInvoiceNumber,
  generateTransactionNumber,
} from "../../src/common/utils/generators.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

describe("Identifier Generators", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generates formatted client numbers with padding: SD-CL-000001", async () => {
    vi.spyOn(prisma.client, "findFirst").mockResolvedValueOnce(null as any);
    vi.spyOn(prisma.client, "count").mockResolvedValueOnce(0);
    vi.spyOn(prisma.client, "findUnique").mockResolvedValueOnce(null as any);

    const num1 = await generateClientNumber("org-123");
    expect(num1).toBe("SD-CL-000001");

    vi.spyOn(prisma.client, "findFirst").mockResolvedValueOnce({
      clientNumber: "SD-CL-000042",
    } as any);
    vi.spyOn(prisma.client, "findUnique").mockResolvedValueOnce(null as any);

    const num2 = await generateClientNumber("org-123");
    expect(num2).toBe("SD-CL-000043");
  });

  it("generates year-partitioned application numbers: SD-APP-YYYY-XXXXXX", async () => {
    const currentYear = new Date().getFullYear();
    vi.spyOn(prisma.application, "findFirst").mockResolvedValueOnce(null as any);
    vi.spyOn(prisma.application, "count").mockResolvedValueOnce(0);
    vi.spyOn(prisma.application, "findUnique").mockResolvedValueOnce(null as any);

    const appNum = await generateApplicationNumber("org-123");
    expect(appNum).toBe(`SD-APP-${currentYear}-000001`);
  });

  it("generates invoice numbers: SD-INV-YYYY-XXXXXX", async () => {
    const currentYear = new Date().getFullYear();
    vi.spyOn(prisma.payment, "findFirst").mockResolvedValueOnce({
      invoiceNumber: `SD-INV-${currentYear}-000009`,
    } as any);
    vi.spyOn(prisma.payment, "findUnique").mockResolvedValueOnce(null as any);

    const invNum = await generateInvoiceNumber("org-123");
    expect(invNum).toBe(`SD-INV-${currentYear}-000010`);
  });

  it("generates transaction numbers: SD-TX-YYYY-XXXXXX", async () => {
    const currentYear = new Date().getFullYear();
    vi.spyOn(prisma.paymentTransaction, "findFirst").mockResolvedValueOnce({
      transactionNumber: `SD-TX-${currentYear}-000099`,
    } as any);
    vi.spyOn(prisma.paymentTransaction, "findUnique").mockResolvedValueOnce(null as any);

    const txNum = await generateTransactionNumber("org-123");
    expect(txNum).toBe(`SD-TX-${currentYear}-000100`);
  });
});
