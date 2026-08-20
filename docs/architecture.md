# Swift Doc Backend — Architecture & System Design

## 1. Architectural Principles

The Swift Doc backend is architected as a modular, layered monolith designed to transition seamlessly into scalable microservices or serverless functions in future phases.

```text
┌─────────────────────────────────────────────────────────────┐
│                       HTTP Transport Layer                  │
│   (Express, Helmet, CORS, Error Handler, Zod Validation)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Module Domain Controllers                │
│    (Auth, Clients, Services, Applications, Documents, etc.) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                     Domain Services Layer                   │
│   (Business Logic, State Machine, Snapshotting, Precision)  │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│   Infrastructure Providers  │ │     Database & Persistence  │
│  - Storage (Cloudinary)     │ │  - PostgreSQL               │
│  - Email (Resend)           │ │  - Prisma ORM               │
│  - SMS (Africa's Talking)   │ │  - Atomic Transactions      │
│  - Payments (M-Pesa Daraja) │ │  - Append-Only Audit Trail  │
└─────────────────────────────┘ └─────────────────────────────┘
```

## 2. Directory Layout

```text
src/
├── app.ts                  # Express application configuration & middleware
├── server.ts               # Server startup & graceful shutdown
├── config/
│   ├── env.ts              # Zod-validated environment variables
│   └── constants.ts        # System enums, roles, and status constants
├── common/
│   ├── errors/             # AppError hierarchy with HTTP status codes
│   ├── middleware/         # Auth, RBAC, Validation, Error Handling
│   ├── types/              # AuthenticatedRequest, PaginatedResult
│   └── utils/              # State machine, Generators, Money arithmetic, Audit, Duplicate detector
├── infrastructure/
│   ├── database/           # Prisma client singleton & connection pooling
│   ├── storage/            # Cloudinary & Mock storage providers
│   ├── email/              # Resend & Mock transactional email providers
│   ├── sms/                # Africa's Talking & Mock SMS providers
│   └── payments/           # Safaricom M-Pesa Daraja & Mock payment providers
├── modules/
│   ├── auth/               # Register, Login, Token Refresh, Password Reset
│   ├── clients/            # Client 360 profile, Duplicate detection
│   ├── services/           # Service catalog & requirement configurations
│   ├── applications/       # Application lifecycle, Snapshots, State machine, Assignments, Notes
│   ├── documents/          # Document uploads, Versioning, Review workflows
│   ├── payments/           # Invoicing, STK push, Webhook callbacks, Reconciliation
│   ├── notifications/      # In-app notifications
│   ├── audit/              # Immutable audit logging
│   └── health/             # Health & readiness probes
└── docs/                   # OpenAPI 3.0 specification & Swagger UI
```

## 3. Core Business Concepts

1. **Application as Primary Domain Entity**: All document collection, verification, government tracking, payment invoices, activities, notes, and deliveries are bound to an `Application`.
2. **Strict Two-Role Authorization**: Only `CLIENT` and `ADMIN` exist. Role escalation and cross-client leakage are blocked at the middleware and query level.
3. **Requirement Snapshotting**: When an application is created, current requirements from the Service are cloned into immutable snapshots, ensuring historical applications remain unaffected by future service revisions.
4. **Provider Isolation**: External services (Cloudinary, Resend, Africa's Talking, M-Pesa) are encapsulated behind provider interfaces with fallback mock implementations for local testing and CI/CD.
