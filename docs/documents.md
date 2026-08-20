# Swift Doc Backend — Document Domain & Storage

## 1. Document Architecture

Document management in Swift Doc adheres to strict Kenyan legal compliance and confidentiality standards:

* **Separation of Metadata and Binaries**: Metadata (file name, MIME type, size, checksum, application binding, review status) is stored in PostgreSQL. Raw binaries are stored in secure cloud storage.
* **Storage Provider Abstraction**:
  * Production: Cloudinary Cloud Storage SDK with secure asset delivery.
  * Local/CI: In-memory mock storage provider with deterministic signed URL generation.
* **Immutable Versioning**: Uploading an updated version creates a new `DocumentVersion` row linked to the parent `Document` without overwriting the previous file.

## 2. Document Status Workflow

```text
[PENDING] ──► [VERIFIED]
    │
    └──► [REJECTED] (triggers rejection reason & re-upload request)
```

## 3. Endpoints

* `POST /api/v1/documents/upload`: Multipart upload with `applicationId`, optional `applicationRequirementId`, and document type.
* `GET /api/v1/documents/:id`: Metadata details of document and version history.
* `GET /api/v1/documents/:id/download`: Resolves secure signed download URL.
* `PATCH /api/v1/admin/documents/:id/review`: Admin reviews document (`VERIFIED` / `REJECTED` with rejection reason).
