# Swift Doc Backend — Application Lifecycle & State Machine

## 1. Application as the Central Domain Entity

The primary operational entity in the system is `Application`. Every business process (document collection, verification, government submissions on eCitizen/BRS/iTax, payments, and deliverables) revolves around an application.

## 2. Complete State Machine Lifecyle

```text
       [NEW]
         │
         ▼
  [QUALIFICATION]
         │
         ▼
[REQUIREMENTS_PENDING] ◄────────────────┐
         │                               │
         ▼                               │
  [DOCUMENT_REVIEW] ─────────────────────┤ (if additional info needed)
         │                               │
         ▼                               │
[READY_FOR_SUBMISSION]                   │
         │                               │
         ▼                               │
    [SUBMITTED]                          │
         │                               │
         ▼                               │
[GOVERNMENT_PROCESSING] ─────────────────┘
         │
         ▼
    [APPROVED]
         │
         ▼
[DOCUMENT_RECEIVED]
         │
         ▼
  [QUALITY_CHECK]
         │
         ▼
[READY_FOR_DELIVERY]
         │
         ▼
    [DELIVERED]
         │
         ▼
     [CLOSED]
```

### Exceptional & Terminal States:
* `ADDITIONAL_INFORMATION_REQUIRED`: Triggered when document review or government processing rejects or requests amended materials.
* `ON_HOLD`: Application paused pending client or external agency action.
* `CANCELLED`: Terminal state initiated by admin or client request before execution.

## 3. Requirement Snapshots

To guarantee historical audit integrity:
* When an application is created (`POST /api/v1/client/applications` or `POST /api/v1/admin/applications`), the current active `ServiceRequirement` records for that service are cloned directly into `ApplicationRequirement` rows.
* If administrators modify service requirements in the future (e.g., adding a new document requirement in 2027), existing applications created in 2026 retain their original snapshotted requirements.

## 4. SLA Foundation & Assignments

* Each service specifies `slaHours` (e.g., 72 hours for company registration).
* When created, `startedAt` is stamped and `dueAt` is computed.
* `ApplicationAssignment` maintains an append-only log of admin officer ownership transitions without overwriting historical records.
