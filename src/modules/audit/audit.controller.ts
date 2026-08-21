import { Response, NextFunction } from "express";
import { auditService } from "./audit.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class AuditController {
  async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page,
        limit,
        search,
        actorId,
        actorEmail,
        role,
        action,
        category,
        entityType,
        resource,
        entityId,
        resourceId,
        status,
        from,
        to,
      } = req.query as any;

      const result = await auditService.listAuditLogs(req.user!.organizationId, {
        page: Number(page) || 1,
        limit: Number(limit) || 25,
        search: search ? String(search) : undefined,
        actorId: actorId ? String(actorId) : undefined,
        actorEmail: actorEmail ? String(actorEmail) : undefined,
        role: role ? String(role) : undefined,
        action: action ? String(action) : undefined,
        category: category ? String(category) : undefined,
        entityType: entityType ? String(entityType) : undefined,
        resource: resource ? String(resource) : undefined,
        entityId: entityId ? String(entityId) : undefined,
        resourceId: resourceId ? String(resourceId) : undefined,
        status: status ? String(status) : undefined,
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
        summaryMetrics: result.summaryMetrics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAuditSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await auditService.getAuditSummary(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();
