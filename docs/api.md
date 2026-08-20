# Swift Doc Backend — API Reference & Endpoint Specifications

## 1. Base URL & Protocol

* **API Prefix**: `/api/v1`
* **Content-Type**: `application/json` (except multipart uploads on `/documents/upload`)
* **Authentication**: `Authorization: Bearer <access-token>`
* **Interactive Documentation**: Available at `http://localhost:5000/docs` (Swagger UI) or `/api/v1/openapi.json`.

## 2. Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [ ... ]
  }
}
```

## 3. Core Route Inventory

### Authentication (`/api/v1/auth`)
* `POST /auth/register`: Create new client user and profile
* `POST /auth/login`: Authenticate and obtain JWT access + refresh tokens
* `POST /auth/refresh`: Rotate refresh token
* `POST /auth/logout`: Revoke active session
* `GET /auth/me`: Current user details

### Client Portal (`/api/v1/client`)
* `GET /client/profile`: Fetch authenticated client 360 profile
* `PATCH /client/profile`: Update profile fields
* `GET /client/services`: Browse active service catalog
* `GET /client/applications`: List client's applications (paginated)
* `POST /client/applications`: Create new application with snapshotted requirements and invoice
* `GET /client/applications/:id`: Application details with requirements, payments, documents, and timeline
* `POST /client/applications/:id/requirements/:reqId`: Submit dynamic requirement answers
* `GET /client/notifications`: Fetch user notifications
* `PATCH /client/notifications/:id/read`: Mark notification as read

### Public Service Catalog (`/api/v1/services`)
* `GET /services`: List active categories and services
* `GET /services/:id`: Service details with requirements

### Documents (`/api/v1/documents`)
* `POST /documents/upload`: Upload file for an application requirement
* `GET /documents/:id`: Document metadata and version history
* `GET /documents/:id/download`: Secure signed download URL

### Payments (`/api/v1/payments`)
* `POST /payments/mpesa/stkpush`: Initiate Daraja STK Push prompt to client phone
* `POST /payments/mpesa/callback`: Public Safaricom Daraja callback webhook
* `GET /payments/:id`: Fetch invoice and transaction breakdown

### Administrative Operations (`/api/v1/admin`)
* `GET /admin/clients`: Search and list all clients
* `POST /admin/clients`: Register/onboard client manually
* `GET /admin/clients/:id`: Full 360 client profile
* `PATCH /admin/clients/:id`: Update client record
* `GET /admin/services`: Manage services
* `POST /admin/services`: Create new catalog service
* `PATCH /admin/services/:id`: Update service
* `POST /admin/services/:id/requirements`: Add requirement to service
* `GET /admin/applications`: Operational applications queue with filters
* `POST /admin/applications`: Create application on behalf of a client
* `GET /admin/applications/:id`: Full admin view of application
* `PATCH /admin/applications/:id/status`: Transition application lifecycle state
* `PATCH /admin/applications/:id/assign`: Assign/reassign application to admin officer
* `POST /admin/applications/:id/notes`: Add internal admin note or client notice
* `POST /admin/applications/:id/government-link`: Link external eCitizen/BRS tracking number
* `PATCH /admin/documents/:id/review`: Approve or reject submitted document
* `POST /admin/payments/record`: Record manual cash, bank transfer, or cheque payment
* `GET /admin/audit-logs`: Query immutable audit trail
