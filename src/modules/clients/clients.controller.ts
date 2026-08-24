import { Response, NextFunction } from "express";
import { clientService } from "./clients.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class ClientController {
  // Client self-profile endpoints
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const profile = await clientService.getClientProfile(clientId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.clientId!;
      const updated = await clientService.updateClientProfile(
        clientId,
        req.body,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin operational endpoints
  async listClients(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, search, clientType, isDuplicateFlagged, isReviewed } = req.query as any;
      const result = await clientService.listClients(req.user!.organizationId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search,
        clientType,
        isDuplicateFlagged: isDuplicateFlagged !== undefined ? isDuplicateFlagged === "true" || isDuplicateFlagged === true : undefined,
        isReviewed: isReviewed !== undefined ? isReviewed === "true" || isReviewed === true : undefined,
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

  async listRegistrations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, search, clientType, isDuplicateFlagged, isReviewed } = req.query as any;
      const result = await clientService.listRegistrations(req.user!.organizationId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search,
        clientType,
        isDuplicateFlagged: isDuplicateFlagged !== undefined ? isDuplicateFlagged === "true" || isDuplicateFlagged === true : undefined,
        isReviewed: isReviewed !== undefined ? isReviewed === "true" || isReviewed === true : false,
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

  async getRegistrationById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const client = await clientService.getAdminClientById(
        id,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async reviewRegistration(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const updated = await clientService.reviewRegistration(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.body
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminClientById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const client = await clientService.getAdminClientById(
        id,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async createAdminClient(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.createAdminClient(
        req.user!.organizationId,
        req.body,
        req.user!.id
      );

      res.status(201).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadProfileImage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientService.uploadProfileImage(req.user!.id, req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProfileImage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientService.deleteProfileImage(req.user!.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const clientController = new ClientController();

