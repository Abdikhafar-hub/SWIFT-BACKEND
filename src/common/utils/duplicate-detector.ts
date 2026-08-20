import { prisma } from "../../infrastructure/database/prisma.js";

export interface DuplicateDetectionInput {
  organizationId: string;
  excludeClientId?: string;
  email?: string | null;
  phone?: string | null;
  nationalId?: string | null;
  passportNumber?: string | null;
  kraPin?: string | null;
  businessName?: string | null;
}

export interface DuplicateDetectionResult {
  isDuplicateFound: boolean;
  score: number;
  confidence: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  matchedClientIds: string[];
}

export async function detectDuplicateClient(input: DuplicateDetectionInput): Promise<DuplicateDetectionResult> {
  const reasons: string[] = [];
  const matchedClientIds = new Set<string>();
  let score = 0;

  const filters: Array<Record<string, unknown>> = [];

  if (input.nationalId) {
    filters.push({ nationalId: input.nationalId.trim() });
  }
  if (input.passportNumber) {
    filters.push({ passportNumber: input.passportNumber.trim() });
  }
  if (input.kraPin) {
    filters.push({ kraPin: { equals: input.kraPin.trim(), mode: "insensitive" } });
  }
  if (input.email) {
    filters.push({ email: { equals: input.email.trim(), mode: "insensitive" } });
  }
  if (input.phone) {
    // Normalize phone suffix (last 9 digits)
    const cleanPhone = input.phone.replace(/[^0-9]/g, "").slice(-9);
    if (cleanPhone.length >= 9) {
      filters.push({ phone: { contains: cleanPhone } });
    }
  }
  if (input.businessName && input.businessName.trim().length > 3) {
    filters.push({ businessName: { equals: input.businessName.trim(), mode: "insensitive" } });
  }

  if (filters.length === 0) {
    return {
      isDuplicateFound: false,
      score: 0,
      confidence: "NONE",
      reasons: [],
      matchedClientIds: [],
    };
  }

  const existingMatches = await prisma.client.findMany({
    where: {
      organizationId: input.organizationId,
      id: input.excludeClientId ? { not: input.excludeClientId } : undefined,
      OR: filters,
    },
    select: {
      id: true,
      clientNumber: true,
      fullName: true,
      email: true,
      phone: true,
      nationalId: true,
      passportNumber: true,
      kraPin: true,
      businessName: true,
    },
  });

  for (const client of existingMatches) {
    matchedClientIds.add(client.id);

    if (input.nationalId && client.nationalId === input.nationalId.trim()) {
      score += 50;
      reasons.push(`Exact National ID match with ${client.clientNumber} (${client.fullName})`);
    }
    if (input.passportNumber && client.passportNumber === input.passportNumber.trim()) {
      score += 50;
      reasons.push(`Exact Passport match with ${client.clientNumber} (${client.fullName})`);
    }
    if (input.kraPin && client.kraPin?.toLowerCase() === input.kraPin.trim().toLowerCase()) {
      score += 45;
      reasons.push(`Exact KRA PIN match with ${client.clientNumber} (${client.fullName})`);
    }
    if (input.email && client.email.toLowerCase() === input.email.trim().toLowerCase()) {
      score += 30;
      reasons.push(`Email match with ${client.clientNumber} (${client.fullName})`);
    }
    if (input.phone) {
      const p1 = input.phone.replace(/[^0-9]/g, "").slice(-9);
      const p2 = client.phone.replace(/[^0-9]/g, "").slice(-9);
      if (p1.length >= 9 && p1 === p2) {
        score += 25;
        reasons.push(`Phone number match with ${client.clientNumber} (${client.fullName})`);
      }
    }
    if (input.businessName && client.businessName && client.businessName.toLowerCase() === input.businessName.trim().toLowerCase()) {
      score += 20;
      reasons.push(`Business Name match with ${client.clientNumber}`);
    }
  }

  let confidence: "NONE" | "LOW" | "MEDIUM" | "HIGH" = "NONE";
  if (score >= 45) confidence = "HIGH";
  else if (score >= 25) confidence = "MEDIUM";
  else if (score > 0) confidence = "LOW";

  return {
    isDuplicateFound: score >= 25,
    score,
    confidence,
    reasons,
    matchedClientIds: Array.from(matchedClientIds),
  };
}
