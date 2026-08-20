import { prisma } from "../../infrastructure/database/prisma.js";
import { UserRole, Prisma } from "@prisma/client";

export interface CreateAuditLogInput {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function createAuditLog(
  input: CreateAuditLogInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  await client.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      actorRole: input.actorRole || null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId || null,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      metadata: input.metadata || Prisma.JsonNull,
    },
  });
}

export const recordAuditLog = createAuditLog;
