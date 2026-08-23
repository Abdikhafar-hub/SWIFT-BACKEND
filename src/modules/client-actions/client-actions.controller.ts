import { Response, NextFunction } from "express";
import { clientActionsService } from "./client-actions.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class ClientActionsController {
  // Admin: Create Action
  async createAction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.applicationId);
      const action = await clientActionsService.createAction(
        applicationId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          type: req.body.type,
          title: req.body.title,
          description: req.body.description,
          priority: req.body.priority,
          dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
          requirementId: req.body.requirementId,
        }
      );

      res.status(201).json({
        success: true,
        data: action,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client or Admin: Complete Action
  async completeAction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actionId = String(req.params.id);
      const result = await clientActionsService.completeAction(
        actionId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.role,
        req.user!.email,
        {
          completionNotes: req.body.completionNotes,
          responsePayload: req.body.responsePayload,
          documentId: req.body.documentId,
        }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Cancel Action
  async cancelAction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actionId = String(req.params.id);
      const result = await clientActionsService.cancelAction(
        actionId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body.reason
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client & Admin: Get Actions for Application
  async getApplicationActions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.applicationId);
      const actions = await clientActionsService.getApplicationActions(
        applicationId,
        req.user!.organizationId,
        req.user!.role,
        req.user!.clientId || undefined
      );

      res.status(200).json({
        success: true,
        data: actions,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Get My Open Actions
  async getMyOpenActions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actions = await clientActionsService.getClientOpenActions(
        req.user!.organizationId,
        req.user!.clientId!
      );

      res.status(200).json({
        success: true,
        data: actions,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Get All Client Actions
  async getClientActions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actions = await clientActionsService.getClientActions(
        req.user!.organizationId,
        req.user!.clientId!,
        req.query.status as any
      );

      res.status(200).json({
        success: true,
        data: actions,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client & Admin: Get Single Action by ID
  async getActionById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actionId = String(req.params.id);
      const action = await clientActionsService.getActionById(
        actionId,
        req.user!.organizationId,
        req.user!.role,
        req.user!.clientId || undefined
      );

      res.status(200).json({
        success: true,
        data: action,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get All Actions (Action Center Queue)
  async getAllActionsForAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientActionsService.getAllActionsForAdmin(
        req.user!.organizationId,
        {
          status: req.query.status as any,
          priority: req.query.priority as any,
          type: req.query.type as any,
          applicationId: req.query.applicationId as string,
          clientId: req.query.clientId as string,
          search: req.query.search as string,
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 20,
        }
      );

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const clientActionsController = new ClientActionsController();

