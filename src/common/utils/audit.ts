import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, Prisma } from "@prisma/client";

export type AuditActionCategory =
  | "AUTH"
  | "USER"
  | "CLIENT"
  | "APPLICATION"
  | "DOCUMENT"
  | "QUALITY_CONTROL"
  | "GOVERNMENT"
  | "INVOICE"
  | "PAYMENT"
  | "REFUND"
  | "DELIVERY"
  | "SERVICE"
  | "SETTINGS"
  | "NOTIFICATION"
  | "SECURITY"
  | "SYSTEM";

export type AuditStatus = "SUCCESS" | "FAILURE" | "WARNING" | "INFO";

export interface CreateAuditLogInput {
  organizationId: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: string;
  actionCategory?: AuditActionCategory | string | null;
  description?: string | null;
  resource?: string; // Legacy/Alias for entityType
  resourceId?: string | null; // Legacy/Alias for entityId
  entityType?: string | null;
  entityId?: string | null;
  entityReference?: string | null;
  previousValue?: any;
  newValue?: any;
  status?: AuditStatus | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | Prisma.InputJsonValue | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "usertoken",
  "accesstoken",
  "refreshtoken",
  "secret",
  "otphash",
  "pendingemailotphash",
  "creditcard",
  "cardnumber",
  "cvv",
  "passkey",
  "api_key",
  "apikey",
]);

export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("key")
    ) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeAuditData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export async function createAuditLog(
  input: CreateAuditLogInput,
  tx?: Prisma.TransactionClient
): Promise<any> {
  const client = tx || prisma;

  const entityType = input.entityType || input.resource || "System";
  const entityId = input.entityId || input.resourceId || null;
  const status = input.status || "SUCCESS";

  const sanitizedPrev = input.previousValue ? sanitizeAuditData(input.previousValue) : undefined;
  const sanitizedNext = input.newValue ? sanitizeAuditData(input.newValue) : undefined;
  const sanitizedMeta = input.metadata ? sanitizeAuditData(input.metadata) : undefined;

  try {
    const log = await client.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId || null,
        actorName: input.actorName || null,
        actorEmail: input.actorEmail || null,
        actorRole: input.actorRole || null,
        action: input.action,
        actionCategory: input.actionCategory || null,
        description: input.description || `${input.action} on ${entityType}`,
        resource: entityType,
        resourceId: entityId,
        entityType,
        entityId,
        entityReference: input.entityReference || null,
        previousValue: sanitizedPrev ? (sanitizedPrev as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValue: sanitizedNext ? (sanitizedNext as Prisma.InputJsonValue) : Prisma.JsonNull,
        status,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        metadata: sanitizedMeta ? (sanitizedMeta as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    return log;
  } catch (error) {
    console.error("Failed to persist audit log record:", error);
    return null;
  }
}

export const recordAuditLog = createAuditLog;
