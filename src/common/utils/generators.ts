import { prisma } from "../../infrastructure/database/prisma.js";

/**
 * Generate monotonically increasing human-friendly client numbers: SD-CL-000001
 */
export async function generateClientNumber(organizationId: string): Promise<string> {
  const prefix = "SD-CL-";
  const latest = await prisma.client.findFirst({
    where: { organizationId, clientNumber: { startsWith: prefix } },
    orderBy: { clientNumber: "desc" },
    select: { clientNumber: true },
  });

  let nextSeq = 1;
  if (latest?.clientNumber) {
    const numPart = parseInt(latest.clientNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.client.count({ where: { organizationId } });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.client.findUnique({ where: { clientNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate year-partitioned application numbers: SD-APP-2026-000001
 */
export async function generateApplicationNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-APP-${year}-`;

  const latest = await prisma.application.findFirst({
    where: { organizationId, applicationNumber: { startsWith: prefix } },
    orderBy: { applicationNumber: "desc" },
    select: { applicationNumber: true },
  });

  let nextSeq = 1;
  if (latest?.applicationNumber) {
    const numPart = parseInt(latest.applicationNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.application.count({
      where: { organizationId, applicationNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.application.findUnique({ where: { applicationNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate invoice numbers: SD-INV-2026-000001
 */
export async function generateInvoiceNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-INV-${year}-`;

  const latest = await prisma.payment.findFirst({
    where: { organizationId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextSeq = 1;
  if (latest?.invoiceNumber) {
    const numPart = parseInt(latest.invoiceNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.payment.count({
      where: { organizationId, invoiceNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.payment.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate transaction numbers: SD-TX-2026-000001
 */
export async function generateTransactionNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-TX-${year}-`;

  const latest = await prisma.paymentTransaction.findFirst({
    where: { organizationId, transactionNumber: { startsWith: prefix } },
    orderBy: { transactionNumber: "desc" },
    select: { transactionNumber: true },
  });

  let nextSeq = 1;
  if (latest?.transactionNumber) {
    const numPart = parseInt(latest.transactionNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.paymentTransaction.count({
      where: { organizationId, transactionNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.paymentTransaction.findUnique({ where: { transactionNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate receipt numbers: SD-RCP-2026-000001
 */
export async function generateReceiptNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-RCP-${year}-`;

  const latest = await prisma.receipt.findFirst({
    where: { organizationId, receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });

  let nextSeq = 1;
  if (latest?.receiptNumber) {
    const numPart = parseInt(latest.receiptNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.receipt.count({
      where: { organizationId, receiptNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.receipt.findUnique({ where: { receiptNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate refund numbers: SD-RF-2026-000001
 */
export async function generateRefundNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-RF-${year}-`;

  const latest = await prisma.refund.findFirst({
    where: { organizationId, refundNumber: { startsWith: prefix } },
    orderBy: { refundNumber: "desc" },
    select: { refundNumber: true },
  });

  let nextSeq = 1;
  if (latest?.refundNumber) {
    const numPart = parseInt(latest.refundNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.refund.count({
      where: { organizationId, refundNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.refund.findUnique({ where: { refundNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}

/**
 * Generate financial adjustment numbers: SD-ADJ-2026-000001
 */
export async function generateAdjustmentNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SD-ADJ-${year}-`;

  const latest = await prisma.financialAdjustment.findFirst({
    where: { organizationId, adjustmentNumber: { startsWith: prefix } },
    orderBy: { adjustmentNumber: "desc" },
    select: { adjustmentNumber: true },
  });

  let nextSeq = 1;
  if (latest?.adjustmentNumber) {
    const numPart = parseInt(latest.adjustmentNumber.replace(prefix, ""), 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  } else {
    const count = await prisma.financialAdjustment.count({
      where: { organizationId, adjustmentNumber: { startsWith: prefix } },
    });
    nextSeq = count + 1;
  }

  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const exists = await prisma.financialAdjustment.findUnique({ where: { adjustmentNumber: candidate } });
    if (!exists) return candidate;
    nextSeq++;
  }
}
