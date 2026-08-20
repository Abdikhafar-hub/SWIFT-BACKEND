import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma } from "@prisma/client";
import { PaginatedResult } from "../../common/types/index.js";

export class AuditService {
  async listAuditLogs(
    organizationId: string,
    params: {
      page: number;
      limit: number;
      resource?: string;
      resourceId?: string;
      actorId?: string;
      action?: string;
      search?: string;
    }
  ): Promise<PaginatedResult<any>> {
    const skip = (params.page - 1) * params.limit;

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      resource: params.resource || undefined,
      resourceId: params.resourceId || undefined,
      actorId: params.actorId || undefined,
      action: params.action ? { contains: params.action, mode: "insensitive" } : undefined,
    };

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { actorEmail: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { resource: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPages = Math.ceil(total / params.limit) || 1;

    return {
      items,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    };
  }
}

export const auditService = new AuditService();
