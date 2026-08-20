import { Response, NextFunction } from "express";
import { applicationService } from "./applications.service.js";
import { applicationReadinessService } from "./application-readiness.service.js";
import { adminAssignmentService } from "./admin-assignment.service.js";
import { requirementReviewService } from "./requirement-review.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { UserRole } from "@prisma/client";

export class ApplicationController {
  // Client Endpoints
  async createClientApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await applicationService.createApplication(
        {
          organizationId: req.user!.organizationId,
          clientId: req.user!.clientId!,
          serviceId: req.body.serviceId,
          notesSummary: req.body.notesSummary,
          metadata: req.body.metadata,
        },
        {
          id: req.user!.id,
          email: req.user!.email,
          role: req.user!.role,
          clientId: req.user!.clientId,
        }
      );

      res.status(201).json({
        success: true,
        data: app,
      });
    } catch (error) {
      next(error);
    }
  }

  async listClientApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, status, priority, search } = req.query as any;
      const result = await applicationService.listApplications(
        req.user!.organizationId,
        {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          status,
          priority,
          search,
        },
        req.user!
      );

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getApplicationDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const app = await applicationService.getApplicationDetails(
        id,
        req.user!.organizationId,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: app,
      });
    } catch (error) {
      next(error);
    }
  }

  async getReadiness(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const report = await applicationReadinessService.evaluateReadiness(id, req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async submitRequirement(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const requirementId = String(req.params.requirementId);
      const result = await requirementReviewService.submitRequirementValue({
        applicationId: id,
        requirementId,
        organizationId: req.user!.organizationId,
        clientId: req.user!.clientId || undefined,
        userId: req.user!.id,
        userRole: req.user!.role,
        valueText: req.body.valueText,
        valueNumber: req.body.valueNumber,
        valueDate: req.body.valueDate ? new Date(req.body.valueDate) : undefined,
        valueBoolean: req.body.valueBoolean,
        valueJson: req.body.valueJson,
        reason: req.body.reason,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRequirementHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const requirementId = String(req.params.requirementId);
      const history = await requirementReviewService.getRequirementHistory(requirementId, id);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin Endpoints
  async createAdminApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await applicationService.createApplication(
        {
          organizationId: req.user!.organizationId,
          clientId: req.body.clientId,
          serviceId: req.body.serviceId,
          priority: req.body.priority,
          assignedAdminId: req.body.assignedAdminId,
          notesSummary: req.body.notesSummary,
          metadata: req.body.metadata,
        },
        {
          id: req.user!.id,
          email: req.user!.email,
          role: req.user!.role,
          clientId: req.user!.clientId,
        }
      );

      res.status(201).json({
        success: true,
        data: app,
      });
    } catch (error) {
      next(error);
    }
  }

  async listAdminApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, status, priority, slaStatus, serviceId, clientId, assignedAdminId, search } = req.query as any;
      const result = await applicationService.listApplications(
        req.user!.organizationId,
        {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          status,
          priority,
          slaStatus,
          serviceId,
          clientId,
          assignedAdminId,
          search,
        },
        req.user!
      );

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkloadQueues(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { queueType, queue, assignedAdminId, search, page, limit } = req.query as any;
      const actualQueue = queueType || queue || "all";
      const result = await adminAssignmentService.getWorkloadQueue({
        organizationId: req.user!.organizationId,
        queueType: actualQueue,
        assignedAdminId,
        search,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

      res.status(200).json({
        success: true,
        data: {
          queue: actualQueue,
          items: result.items,
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async transitionStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { status, reason, notifyClient } = req.body;
      const result = await applicationService.transitionStatus(
        id,
        req.user!.organizationId,
        status,
        reason,
        notifyClient !== false,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { assignedAdminId, reason } = req.body;
      const result = await adminAssignmentService.assignAdmin({
        applicationId: id,
        organizationId: req.user!.organizationId,
        assignedAdminId,
        assignerId: req.user!.id,
        assignerEmail: req.user!.email,
        reason,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async unassignAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;
      const result = await adminAssignmentService.unassignAdmin({
        applicationId: id,
        organizationId: req.user!.organizationId,
        unassignerId: req.user!.id,
        unassignerEmail: req.user!.email,
        reason,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async reviewRequirement(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const requirementId = String(req.params.requirementId);
      const { action, reason, reviewNotes } = req.body;
      const result = await requirementReviewService.reviewRequirement({
        applicationId: id,
        requirementId,
        organizationId: req.user!.organizationId,
        adminId: req.user!.id,
        adminEmail: req.user!.email,
        action,
        reason,
        reviewNotes,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async addNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { content, visibility } = req.body;
      const note = await applicationService.addNote(
        id,
        req.user!.organizationId,
        content,
        visibility,
        req.user!.id
      );

      res.status(201).json({
        success: true,
        data: note,
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePriority(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { priority, reason } = req.body;
      const updated = await applicationService.updatePriority(
        id,
        req.user!.organizationId,
        priority,
        reason,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async closeApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason, completionNotes } = req.body;
      const closed = await applicationService.closeApplication(
        id,
        req.user!.organizationId,
        reason,
        completionNotes,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: closed,
      });
    } catch (error) {
      next(error);
    }
  }

  async getComprehensiveWorkQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        status,
        assignedAdminId,
        serviceId,
        priority,
        slaStatus,
        needsAttention,
        overdue,
        search,
        page,
        limit,
      } = req.query as any;

      const result = await applicationService.getComprehensiveWorkQueue(
        req.user!.organizationId,
        {
          status,
          assignedAdminId,
          serviceId,
          priority,
          slaStatus,
          needsAttention: needsAttention === "true",
          overdue: overdue === "true",
          search,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
        }
      );

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
        buckets: result.buckets,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const applicationController = new ApplicationController();
