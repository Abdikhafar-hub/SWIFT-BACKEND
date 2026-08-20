import { Response, NextFunction } from "express";
import { documentService } from "./documents.service.js";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { DocumentStatus } from "@prisma/client";

export class DocumentController {
  async listDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await documentService.listDocuments(
        req.user!.organizationId,
        {
          page: req.query.page ? Number(req.query.page) : undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          clientId: req.query.clientId ? String(req.query.clientId) : undefined,
          applicationId: req.query.applicationId ? String(req.query.applicationId) : undefined,
          status: req.query.status as DocumentStatus | undefined,
          search: req.query.search ? String(req.query.search) : undefined,
        },
        {
          id: req.user!.id,
          role: req.user!.role,
          clientId: req.user!.clientId,
        }
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

  async uploadDocument(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientId = req.user!.role === "CLIENT" ? req.user!.clientId! : (req.body.clientId || req.user!.clientId!);
      const document = await documentService.uploadDocument(
        {
          organizationId: req.user!.organizationId,
          clientId,
          applicationId: req.body.applicationId,
          applicationRequirementId: req.body.applicationRequirementId,
          documentType: req.body.documentType,
          title: req.body.title,
          fileName: req.body.fileName,
          mimeType: req.body.mimeType,
          base64Data: req.body.base64Data,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
          documentNumber: req.body.documentNumber,
          issuingAuthority: req.body.issuingAuthority,
          issuedAt: req.body.issuedAt ? new Date(req.body.issuedAt) : undefined,
        },
        {
          id: req.user!.id,
          email: req.user!.email,
          role: req.user!.role,
        }
      );

      res.status(201).json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  }

  async reviewDocument(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const documentId = String(req.params.id);
      const document = await documentService.reviewDocument(
        documentId,
        req.user!.organizationId,
        req.body.status as DocumentStatus,
        req.body.reviewNotes,
        req.body.requestReplacement,
        req.body.replacementDeadline ? new Date(req.body.replacementDeadline) : undefined,
        {
          id: req.user!.id,
          email: req.user!.email,
        }
      );

      res.status(200).json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMetadata(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const documentId = String(req.params.id);
      const updated = await documentService.updateMetadata(
        documentId,
        req.user!.organizationId,
        req.user!.id,
        req.user!.email,
        {
          title: req.body.title,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : req.body.expiresAt === null ? null : undefined,
          documentNumber: req.body.documentNumber,
          issuingAuthority: req.body.issuingAuthority,
          issuedAt: req.body.issuedAt ? new Date(req.body.issuedAt) : req.body.issuedAt === null ? null : undefined,
          isArchived: req.body.isArchived,
        }
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async triggerExpiryCheck(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await documentService.checkExpiringDocuments(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDownloadUrl(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const documentId = String(req.params.id);
      const downloadInfo = await documentService.getSecureDownloadUrl(
        documentId,
        req.user!.organizationId,
        {
          id: req.user!.id,
          role: req.user!.role,
          clientId: req.user!.clientId,
        }
      );

      res.status(200).json({
        success: true,
        data: downloadInfo,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();
