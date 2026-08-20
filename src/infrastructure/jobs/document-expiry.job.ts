import { documentService } from "../../modules/documents/documents.service.js";

export async function runDocumentExpiryJob(payload?: { organizationId?: string }) {
  return documentService.checkExpiringDocuments(payload?.organizationId);
}
