import { Response, NextFunction } from "express";
import { governmentProcessingService } from "./government.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { GovernmentStatus } from "@prisma/client";

export class GovernmentController {
  // Admin: Real-time Database KPI Aggregates
  async getDashboardKpis(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kpis = await governmentProcessingService.getGovernmentDashboardKpis(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get Readiness Evaluated Applications
  async getReadyApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const apps = await governmentProcessingService.getReadyApplicationsForSubmission(req.user!.organizationId, search);
      res.status(200).json({
        success: true,
        data: apps,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Create Government Submission Record
  async createSubmission(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = req.body.applicationId || String(req.params.id);
      const record = await governmentProcessingService.createGovernmentSubmission(
        applicationId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Update Status & Lifecycle
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const record = await governmentProcessingService.updateStatus(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Record Government Query & Create Client Action
  async recordQuery(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const query = await governmentProcessingService.recordQuery(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: query,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Record Statutory Payment
  async recordPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const payment = await governmentProcessingService.recordPayment(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Schedule Appointment / Biometrics
  async scheduleAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const appointment = await governmentProcessingService.scheduleAppointment(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Record Registry Follow-up Attempt
  async recordFollowUp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const followUp = await governmentProcessingService.recordFollowUp(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: followUp,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Record External Registry Update
  async recordExternalUpdate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const update = await governmentProcessingService.recordExternalUpdate(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(200).json({
        success: true,
        data: update,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Upload Dossier Evidence Document
  async uploadEvidence(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const evidence = await governmentProcessingService.uploadEvidence(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        req.body
      );

      res.status(201).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Assign Case Officers
  async assignCase(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const updated = await governmentProcessingService.assignGovernmentCase(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
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

  // Admin: Get Submission Dossier
  async getDossier(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const dossier = await governmentProcessingService.getSubmissionDossier(id, req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: dossier,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Government Work Queue
  async getGovernmentQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await governmentProcessingService.getGovernmentQueue(
        req.user!.organizationId,
        {
          agency: req.query.agency as string,
          platform: req.query.platform as string,
          status: req.query.status as GovernmentStatus,
          channel: req.query.channel as any,
          officerId: req.query.officerId as string,
          paymentStatus: req.query.paymentStatus as any,
          appointmentStatus: req.query.appointmentStatus as any,
          followUpDue: req.query.followUpDue === "true",
          overdue: req.query.overdue === "true",
          tabView: req.query.tabView as string,
          search: req.query.search as string,
          page: req.query.page ? Number(req.query.page) : undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
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

  // Admin: Add Reference
  async addReference(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const ref = await governmentProcessingService.addReference(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.body
      );

      res.status(201).json({
        success: true,
        data: ref,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Remove Reference
  async removeReference(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const refId = String(req.params.refId);
      const result = await governmentProcessingService.removeReference(
        id,
        refId,
        req.user!.organizationId,
        req.user!.id
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get Status History
  async getStatusHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const history = await governmentProcessingService.getStatusHistory(id, req.user!.organizationId);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  // Client: Get Sanitized Government Tracking
  async getClientTracking(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const result = await governmentProcessingService.getClientGovernmentTracking(
        applicationId,
        req.user!.organizationId,
        req.user!.clientId!
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const governmentController = new GovernmentController();
