# Swift Doc Backend — Database Schema & Data Integrity

## 1. Database Architecture

* **Database Engine**: PostgreSQL 15+
* **ORM**: Prisma ORM with strict migration tracking (`prisma migrate dev` / `prisma migrate deploy`)
* **Monotonic Sequence Enforcement**: Custom generators with zero-collision fallback loops for human-readable IDs (`SD-APP-YYYY-XXXXXX`, `SD-CL-XXXXXX`, `SD-INV-YYYY-XXXXXX`, `SD-TX-YYYY-XXXXXX`).

## 2. Complete Entity Inventory

| Model | Purpose | Key Relationships |
| :--- | :--- | :--- |
| `Organization` | Operational tenant root (`Swift Doc`) | Parent of Users, Clients, Services, Applications, AuditLogs |
| `User` | Authenticated account (`CLIENT` or `ADMIN`) | 1:1 with `Client`, 1:N with RefreshTokens, AuditLogs |
| `RefreshToken` | JWT refresh tokens with rotation and revocation | Belongs to `User` |
| `Client` | 360 customer profile (Individual/Business/Org) | Belongs to `Organization` and `User`; Parent of Applications, Documents, Payments |
| `ServiceCategory` | High-level grouping of Kenyan services | Belongs to `Organization`; Parent of `Service` |
| `Service` | Configurable catalog service | Belongs to `Organization` and `ServiceCategory`; Parent of `ServiceRequirement` |
| `ServiceRequirement` | Dynamic requirement definition (Document, Text, Date, etc.) | Belongs to `Service` |
| `Application` | Central operational record | Belongs to `Organization`, `Client`, `Service`, `User` (assignedAdmin); Parent of Requirements, Docs, Payments, Notes, Activities, GovApps |
| `ApplicationRequirement` | Immutable snapshot of service requirement for an application | Belongs to `Application` and `ServiceRequirement`; Parent of Documents |
| `ApplicationAssignment` | Complete assignment history to admin officers | Belongs to `Application`, `User` (assignedAdmin), `User` (assignedBy) |
| `ApplicationActivity` | Audit timeline of lifecycle events | Belongs to `Application`, `User` (actor) |
| `ApplicationNote` | Internal or client-visible notes | Belongs to `Application`, `User` (author) |
| `Document` | Uploaded document metadata | Belongs to `Organization`, `Client`, `Application`, `ApplicationRequirement`; Parent of `DocumentVersion` |
| `DocumentVersion` | Immutable version tracking with Cloudinary storage key | Belongs to `Document`, `User` (uploadedBy) |
| `Payment` | Invoicing and ledger record in KES | Belongs to `Organization`, `Client`, `Application`; Parent of `PaymentTransaction` |
| `PaymentTransaction` | Granular financial payment event (M-Pesa STK, Cash, Bank) | Belongs to `Payment` |
| `GovernmentApplication` | Tracking interaction with eCitizen, BRS, iTax, TIMS | Belongs to `Application` |
| `Notification` | Multi-channel user notification (In-app, Email, SMS) | Belongs to `Organization`, `User` |
| `AuditLog` | Append-only forensic audit trail | Belongs to `Organization`, `User` (actor) |

## 3. Database Indexes & Performance

* **Unique Constraints**:
  * `User(email)`, `User(organizationId, email)`
  * `Client(clientNumber)`, `Client(organizationId, nationalId)`, `Client(organizationId, kraPin)`
  * `ServiceCategory(code)`, `Service(code)`
  * `ServiceRequirement(serviceId, code)`
  * `Application(applicationNumber)`
  * `Payment(invoiceNumber)`
  * `PaymentTransaction(transactionNumber)`, `PaymentTransaction(externalReference)`
* **Query Performance Composite Indexes**:
  * `Application(organizationId, status, createdAt)`
  * `Application(clientId, status)`
  * `Application(assignedAdminId, status)`
  * `AuditLog(organizationId, resource, createdAt)`
  * `Document(applicationId, status)`
  * `Payment(applicationId, status)`
