import { Response, NextFunction } from "express";
import { auditService } from "./audit.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class AuditController {
  async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, resource, resourceId, actorId, action, search } = req.query as any;
      const result = await auditService.listAuditLogs(req.user!.organizationId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        resource,
        resourceId,
        actorId,
        action,
        search,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();
