# Swift Doc Backend — Phase 3 Operational Engine

## Overview
Phase 3 operationalizes the Swift Doc backend into an enterprise-grade administrative and government processing engine tailored specifically for Kenyan statutory and compliance workflows (eCitizen, BRS, iTax, TIMS, DCI, Lands Registry, etc.).

---

## 1. Government Processing Engine (`/government`)
Tracks and manages all external government portal and registry interactions with full auditability and state transitions.

### Core Models
- `GovernmentApplication`: Represents a submission to a government body. Tracks primary application number, supplementary tracking numbers (name reservation number, payment invoice, clearance ID), submission and approval dates, next follow-up dates, and assigned officer notes.
- `GovernmentStatusHistory`: Immutable audit history of every status transition and officer note.
- `GovernmentReference`: Multi-reference registry for managing multiple external IDs per government application.

### Key Endpoints
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/v1/applications/:id/government-tracking` | Client-safe government tracking status | Client / Admin |
| `GET` | `/api/v1/admin/government-applications/queue` | Admin government submissions work queue | Admin |
| `POST` | `/api/v1/admin/applications/:id/government` | Create new government filing record | Admin |
| `PATCH` | `/api/v1/admin/government-applications/:id/status` | Transition government status & log history | Admin |
| `POST` | `/api/v1/admin/government-applications/:id/request-info` | Process government query & create client action | Admin |
| `POST` | `/api/v1/admin/government-applications/:id/resubmit` | Resubmit to government after query resolution | Admin |
| `POST` | `/api/v1/admin/government-applications/:id/approve` | Record government approval / certificate issuance | Admin |
| `POST` | `/api/v1/admin/government-applications/:id/references` | Attach supplementary tracking numbers | Admin |
| `POST` | `/api/v1/admin/government-applications/:id/schedule-followup` | Schedule follow-up date for admin reminders | Admin |

---

## 2. Client Action Domain (`/client-actions`)
Manages pending client-side prerequisites (document re-uploads, information requests, identity verifications, signing, fee payments).

### Integration Mechanics
1. **Creation**: When an admin creates a `ClientAction` (or when a document is rejected or government raises a query), the system:
   - Sets application status to `CLIENT_ACTION_REQUIRED` or `ADDITIONAL_INFORMATION_REQUIRED`.
   - Automatically records an `ApplicationSlaEvent` with category `CLIENT_WAITING` and pauses the application SLA.
   - Dispatches a multi-channel notification (Email/SMS/In-App) to the client.
2. **Completion**: When the client completes the action:
   - The action status transitions to `COMPLETED`.
   - If no other open actions exist for the application, the application status transitions to `UNDER_REVIEW` / `GOVERNMENT_PROCESSING`.
   - Automatically resumes the application SLA and extends the due date by the exact paused duration.

---

## 3. SLA & Timing Engine (`/sla`)
Provides high-precision tracking of application SLAs with support for paused durations and granular pause categories.

### Pause Categories (`SlaEventCategory`)
- `CLIENT_WAITING`: Waiting for client action, document re-upload, or information clarification.
- `GOVERNMENT_WAITING`: Waiting for government agency processing or system downtime.
- `INTERNAL`: Internal admin review or quality assurance hold.

### SLA Calculation Formula
- **Elapsed Duration**: `(Now - StartedAt) - TotalPausedDuration`
- **Remaining Duration**: `Max(0, DueAt - Now)`
- **Dynamic Recalibration**: On resume, `NewDueAt = DueAt + PausedDuration`

---

## 4. Document Review & Expiry Awareness (`/documents`)
Manages document uploads, version control, multi-page previews, admin reviews, and proactive expiration monitoring.

### Workflow
1. **Upload & Versioning**: New uploads increment `versionNumber` and store file assets securely in Cloudinary.
2. **Review Decision**:
   - `APPROVED`: Satisfies requirement, marks document approved, logs activity.
   - `REJECTED`: Requires rejection notes, automatically generates a `REPLACE_DOCUMENT` client action, pauses SLA, and notifies the client.
3. **Expiry Sweep**: Proactively checks document validity against upcoming expiration windows (30, 60, 90 days) and dispatches renewal alerts.

---

## 5. Notification Orchestrator & Channel Preferences (`/notifications`)
Unified multi-channel communication engine with centralized templates, preference filtering, and error isolation.

### Features
- **Templates**: Centralized dynamic templates for status transitions, government queries, client actions, SLA alerts, and document expiry.
- **Preferences**: Per-user toggles for `emailEnabled`, `smsEnabled`, `inAppEnabled`, and `marketingEnabled`.
- **Non-Blocking Resilience**: Failure of an external SMS or email provider does not fail the primary business database transaction.

---

## 6. Background Jobs Engine (`/infrastructure/jobs`)
Background queue with deduplication, exponential backoff, and scheduled sweep runners:
- **SLA Monitor**: Periodic sweep detecting `AT_RISK` (>75% elapsed) and `OVERDUE` applications.
- **Government Monitor**: Detects overdue follow-up dates and long-pending government queries.
- **Client Action Reminder**: Sends reminders for open actions approaching deadlines (<= 48h).
- **Document Expiry Monitor**: Daily sweep flagging expired documents and dispatching renewal notices.
- **Payment Reminder**: Polite reminders for unpaid applications.
