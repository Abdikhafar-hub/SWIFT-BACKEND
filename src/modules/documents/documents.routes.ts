import { Router } from "express";
import { documentController } from "./documents.controller.js";
import { authenticateToken, requireRole } from "../../common/middleware/auth.js";
import { validateBody } from "../../common/middleware/validate.js";
import {
  uploadDocumentSchema,
  reviewDocumentSchema,
  updateDocumentMetadataSchema,
} from "./documents.schema.js";
import { UserRole } from "@prisma/client";

const router = Router();

// List documents (Client & Admin)
router.get(
  "/documents",
  authenticateToken,
  documentController.listDocuments
);

// Upload document (Client & Admin)
router.post(
  "/documents",
  authenticateToken,
  validateBody(uploadDocumentSchema),
  documentController.uploadDocument
);

// Review document (Admin only)
router.patch(
  "/documents/:id/review",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(reviewDocumentSchema),
  documentController.reviewDocument
);

// Update document metadata (Admin only)
router.patch(
  "/documents/:id/metadata",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  validateBody(updateDocumentMetadataSchema),
  documentController.updateMetadata
);

// Run expiry sweep (Admin only)
router.post(
  "/admin/documents/check-expiring",
  authenticateToken,
  requireRole(UserRole.ADMIN),
  documentController.triggerExpiryCheck
);

// Secure download URL
router.get(
  "/documents/:id/download",
  authenticateToken,
  documentController.getDownloadUrl
);

export const documentRouter = router;
export const documentRoutes = router;
export const adminDocumentRoutes = router;
