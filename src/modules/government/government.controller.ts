import { Response, NextFunction } from "express";
import { governmentProcessingService } from "./government.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { GovernmentStatus } from "@prisma/client";

export class GovernmentController {
  // Admin: Create Government Tracking Record
  async createRecord(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applicationId = String(req.params.id);
      const record = await governmentProcessingService.createRecord(
        applicationId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          platform: req.body.platform,
          governmentAgency: req.body.governmentAgency,
          governmentService: req.body.governmentService,
          externalReference: req.body.externalReference,
          trackingNumber: req.body.trackingNumber,
          status: req.body.status,
          statusDescription: req.body.statusDescription,
          portalUrl: req.body.portalUrl,
          nextFollowUpDate: req.body.nextFollowUpDate ? new Date(req.body.nextFollowUpDate) : undefined,
          expectedCompletionAt: req.body.expectedCompletionAt ? new Date(req.body.expectedCompletionAt) : undefined,
          notes: req.body.notes,
          evidenceDocumentUrl: req.body.evidenceDocumentUrl,
          references: req.body.references,
        }
      );

      res.status(201).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Update Status & Details
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const record = await governmentProcessingService.updateStatus(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          status: req.body.status,
          statusDescription: req.body.statusDescription,
          externalReference: req.body.externalReference,
          trackingNumber: req.body.trackingNumber,
          notes: req.body.notes,
          rejectionReason: req.body.rejectionReason,
          evidenceDocumentUrl: req.body.evidenceDocumentUrl,
          portalUrl: req.body.portalUrl,
          approvalDate: req.body.approvalDate ? new Date(req.body.approvalDate) : undefined,
          completionDate: req.body.completionDate ? new Date(req.body.completionDate) : undefined,
          expectedCompletionAt: req.body.expectedCompletionAt ? new Date(req.body.expectedCompletionAt) : undefined,
          source: req.body.source,
        }
      );

      res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Request Additional Information from Client
  async requestAdditionalInfo(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const result = await governmentProcessingService.requestAdditionalInformation(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          description: req.body.description,
          deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
          clientActionType: req.body.clientActionType,
          clientActionTitle: req.body.clientActionTitle,
          clientActionDescription: req.body.clientActionDescription,
          requirementId: req.body.requirementId,
          notes: req.body.notes,
        }
      );

      res.status(200).json({
        success: true,
        data: {
          governmentApplication: result.updatedGov,
          clientAction: result.clientAction,
          ...result.updatedGov,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Resubmit to Government
  async resubmitGovernment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const result = await governmentProcessingService.resubmitGovernment(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          notes: req.body.notes,
          externalReference: req.body.externalReference,
          trackingNumber: req.body.trackingNumber,
          expectedCompletionAt: req.body.expectedCompletionAt ? new Date(req.body.expectedCompletionAt) : undefined,
          evidenceDocumentUrl: req.body.evidenceDocumentUrl,
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

  // Admin: Record Government Approval
  async recordApproval(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const result = await governmentProcessingService.recordApproval(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          approvalDate: req.body.approvalDate ? new Date(req.body.approvalDate) : undefined,
          completionDate: req.body.completionDate ? new Date(req.body.completionDate) : undefined,
          evidenceDocumentUrl: req.body.evidenceDocumentUrl,
          notes: req.body.notes,
          certificateDocumentId: req.body.certificateDocumentId,
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

  // Admin: Add Supplementary Reference
  async addReference(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const ref = await governmentProcessingService.addReference(
        id,
        req.user!.organizationId,
        req.user!.id,
        {
          referenceType: req.body.referenceType,
          referenceValue: req.body.referenceValue,
          issuingPlatform: req.body.issuingPlatform,
          metadata: req.body.metadata,
        }
      );

      res.status(201).json({
        success: true,
        data: ref,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Remove Supplementary Reference
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

  // Admin: Schedule Follow-Up
  async scheduleFollowUp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const record = await governmentProcessingService.scheduleFollowUp(
        id,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        new Date(req.body.nextFollowUpDate),
        req.body.notes
      );

      res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Government Queue
  async getGovernmentQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await governmentProcessingService.getGovernmentQueue(
        req.user!.organizationId,
        {
          agency: req.query.agency as string,
          platform: req.query.platform as string,
          status: req.query.status as GovernmentStatus,
          followUpDue: req.query.followUpDue === "true",
          overdue: req.query.overdue === "true",
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
