import { Response, NextFunction } from "express";
import { deliveryService } from "./delivery.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class DeliveryController {
  // Admin: List all deliveries with filters and KPI metrics
  async listDeliveries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 25;
      const search = req.query.search ? String(req.query.search) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const carrier = req.query.carrier ? String(req.query.carrier) : undefined;

      const result = await deliveryService.listAllDeliveries(req.user!.organizationId, {
        page,
        limit,
        search,
        status,
        carrier,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Lodge new delivery
  async lodgeDelivery(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const delivery = await deliveryService.lodgeDelivery(
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Dispatch delivery to courier
  async dispatchDeliveryAction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deliveryId = String(req.params.id);
      const delivery = await deliveryService.dispatchDeliveryAction(
        deliveryId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(200).json({
        success: true,
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Confirm physical delivery received (Mark Delivered)
  async confirmDelivery(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deliveryId = String(req.params.id);
      const delivery = await deliveryService.confirmDelivery(
        deliveryId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(200).json({
        success: true,
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Report failed delivery
  async reportFailedDelivery(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deliveryId = String(req.params.id);
      const delivery = await deliveryService.reportFailedDelivery(
        deliveryId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(200).json({
        success: true,
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get single delivery details
  async getDeliveryById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deliveryId = String(req.params.id);
      const delivery = await deliveryService.getDeliveryById(deliveryId, req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Get delivery info for specific application
  async getClientDeliveries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const deliveries = await deliveryService.getDeliveriesForApplication(
        applicationId,
        req.user!.organizationId
      );

      res.status(200).json({
        success: true,
        data: deliveries,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const deliveryController = new DeliveryController();
