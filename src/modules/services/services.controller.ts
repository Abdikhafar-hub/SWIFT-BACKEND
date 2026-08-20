import { Request, Response, NextFunction } from "express";
import { serviceCatalogService } from "./services.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export class ServiceCatalogController {
  async listCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await serviceCatalogService.listCategories(req.user?.organizationId);
      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async listPublicServices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category } = req.query;

      const org = await prisma.organization.findFirst({
        where: { slug: "swift-doc" },
      });

      const categories = await serviceCatalogService.listPublicServices(
        org?.id || req.user?.organizationId || "",
        category ? String(category) : undefined
      );

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getServiceBySlug(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await prisma.organization.findFirst({
        where: { slug: "swift-doc" },
      });

      const slug = String(req.params.slug);
      const service = await serviceCatalogService.getServiceBySlugOrId(
        slug,
        org?.id || ""
      );

      res.status(200).json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }

  async listAdminServices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const services = await serviceCatalogService.listAdminServices(req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: services,
      });
    } catch (error) {
      next(error);
    }
  }

  async createService(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const service = await serviceCatalogService.createService(
        req.user!.organizationId,
        req.body,
        req.user!.id
      );

      res.status(201).json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateService(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const service = await serviceCatalogService.updateService(
        id,
        req.user!.organizationId,
        req.body,
        req.user!.id
      );

      res.status(200).json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const serviceCatalogController = new ServiceCatalogController();
