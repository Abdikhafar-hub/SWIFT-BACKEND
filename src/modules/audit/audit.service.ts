import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma, UserRole } from "@prisma/client";
import { PaginatedResult } from "../../common/types/index.js";

export interface ListAuditLogsParams {
  page: number;
  limit: number;
  search?: string;
  actorId?: string;
  actorEmail?: string;
  role?: UserRole | string;
  action?: string;
  category?: string;
  entityType?: string;
  resource?: string; // Legacy alias
  entityId?: string;
  resourceId?: string; // Legacy alias
  status?: string;
  from?: string;
  to?: string;
}

export interface AuditSummaryMetrics {
  totalEvents: number;
  eventsToday: number;
  successCount: number;
  failureCount: number;
  activeUsersToday: number;
  loginEventsToday: number;
}

export interface AuditLogQueryResult extends PaginatedResult<any> {
  summaryMetrics?: AuditSummaryMetrics;
}

export class AuditService {
  async listAuditLogs(
    organizationId: string,
    params: ListAuditLogsParams
  ): Promise<AuditLogQueryResult> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 25));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
    };

    // Filter: Entity Type / Resource
    const entityType = params.entityType || params.resource;
    if (entityType) {
      where.OR = [
        { entityType: { equals: entityType, mode: "insensitive" } },
        { resource: { equals: entityType, mode: "insensitive" } },
      ];
    }

    // Filter: Entity ID / Resource ID
    const entityId = params.entityId || params.resourceId;
    if (entityId) {
      where.OR = [
        ...(where.OR || []),
        { entityId: entityId },
        { resourceId: entityId },
      ];
    }

    // Filter: Actor ID / Email / Role
    if (params.actorId) {
      where.actorId = params.actorId;
    }
    if (params.actorEmail) {
      where.actorEmail = { equals: params.actorEmail, mode: "insensitive" };
    }
    if (params.role) {
      where.actorRole = params.role as UserRole;
    }

    // Filter: Action & Action Category
    if (params.action) {
      where.action = { contains: params.action, mode: "insensitive" };
    }
    if (params.category) {
      where.actionCategory = { equals: params.category, mode: "insensitive" };
    }

    // Filter: Status
    if (params.status && params.status !== "ALL") {
      where.status = { equals: params.status, mode: "insensitive" };
    }

    // Filter: Date Range (from / to)
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) {
        const fromDate = new Date(params.from);
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (params.to) {
        const toDate = new Date(params.to);
        if (!isNaN(toDate.getTime())) {
          // If toDate is midnight (e.g. 2026-08-21), extend to end of day 23:59:59.999
          if (toDate.getHours() === 0 && toDate.getMinutes() === 0 && toDate.getSeconds() === 0) {
            toDate.setHours(23, 59, 59, 999);
          }
          where.createdAt.lte = toDate;
        }
      }
    }

    // Free Text Search
    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      const searchConditions: Prisma.AuditLogWhereInput[] = [
        { actorName: { contains: q, mode: "insensitive" } },
        { actorEmail: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { actionCategory: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { entityReference: { contains: q, mode: "insensitive" } },
        { resource: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { ipAddress: { contains: q, mode: "insensitive" } },
      ];

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Start of Today (00:00:00 UTC/Local)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, items, totalEvents, eventsToday, successCount, failureCount, todayActors, loginEventsToday] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: { organizationId, createdAt: { gte: startOfToday } } }),
      prisma.auditLog.count({ where: { organizationId, status: "SUCCESS" } }),
      prisma.auditLog.count({ where: { organizationId, status: "FAILURE" } }),
      prisma.auditLog.groupBy({
        by: ["actorEmail"],
        where: { organizationId, createdAt: { gte: startOfToday }, actorEmail: { not: null } },
      }),
      prisma.auditLog.count({
        where: { organizationId, action: "USER_LOGIN", createdAt: { gte: startOfToday } },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summaryMetrics: {
        totalEvents,
        eventsToday,
        successCount,
        failureCount,
        activeUsersToday: todayActors.length,
        loginEventsToday,
      },
    };
  }

  async getAuditSummary(organizationId: string): Promise<AuditSummaryMetrics> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalEvents, eventsToday, successCount, failureCount, todayActors, loginEventsToday] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: { organizationId, createdAt: { gte: startOfToday } } }),
      prisma.auditLog.count({ where: { organizationId, status: "SUCCESS" } }),
      prisma.auditLog.count({ where: { organizationId, status: "FAILURE" } }),
      prisma.auditLog.groupBy({
        by: ["actorEmail"],
        where: { organizationId, createdAt: { gte: startOfToday }, actorEmail: { not: null } },
      }),
      prisma.auditLog.count({
        where: { organizationId, action: "USER_LOGIN", createdAt: { gte: startOfToday } },
      }),
    ]);

    return {
      totalEvents,
      eventsToday,
      successCount,
      failureCount,
      activeUsersToday: todayActors.length,
      loginEventsToday,
    };
  }
}

export const auditService = new AuditService();
