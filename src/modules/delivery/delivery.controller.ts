import { Response, NextFunction } from "express";
import { deliveryService } from "./delivery.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";

export class DeliveryController {
  // Admin: Dispatch delivery
  async dispatchDelivery(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const delivery = await deliveryService.dispatchDelivery(
        applicationId,
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

  // Admin: Confirm physical delivery received
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

  // Client: Get delivery info
  async getClientDeliveries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const deliveries = await deliveryService.getDeliveries(
        applicationId,
        req.user!.organizationId,
        req.user!.clientId!
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
