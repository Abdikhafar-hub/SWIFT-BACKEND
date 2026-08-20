# Swift Doc Backend — Phase 1: Foundation + Core Business Domain

Production backend system for **Swift Doc**, an established Kenyan document registration, processing, compliance, and government-services firm.

---

## 🚀 Key Features

* **Application as Core Entity**: Unified domain model (`Application`, `ApplicationRequirement`, `ApplicationDocument`, `ApplicationActivity`, `ApplicationAssignment`, `ApplicationNote`).
* **Strict Two-Role Authorization**: Exactly `CLIENT` and `ADMIN` roles with complete server-side resource isolation and multi-tenant scoping to `Organization`.
* **Dynamic Requirement Snapshots**: Service requirements are cloned into immutable snapshots upon application creation.
* **Deterministic Identifier Generators**: Human-friendly collision-free IDs (`SD-APP-2026-000001`, `SD-CL-000001`, `SD-INV-2026-000001`, `SD-TX-2026-000001`).
* **Clean External Abstractions**:
  * **Storage**: Cloudinary SDK abstraction + Mock provider with secure signed URLs.
  * **Email**: Resend API abstraction + Mock provider with transactional templates.
  * **SMS**: Africa's Talking SMS abstraction + Mock provider.
  * **Payments**: Safaricom M-Pesa Daraja (STK Push & C2B Webhook) + Mock provider.
* **Financial Integrity**: Precision `Decimal` arithmetic, itemized fee breakdowns (Gov Fee, Service Fee, Tax, Discount) in KES.
* **Immutable Audit Trail**: Append-only audit logging tracking every critical business action.
* **OpenAPI 3.0 & Swagger UI**: Live interactive API documentation at `/docs` and `/api/v1/docs`.

---

## 🛠️ Technology Stack

* **Runtime**: Node.js (ES2022 / NodeNext ESM)
* **Framework**: Express.js
* **Language**: TypeScript (Strict Mode)
* **Database & ORM**: PostgreSQL & Prisma ORM
* **Validation**: Zod
* **Security**: Helmet, CORS, bcryptjs (salt 12), jsonwebtoken (Access + Refresh Token Rotation)
* **Testing**: Vitest & Supertest (Unit, Integration, Security/RBAC test suites)

---

## 📦 Getting Started

### 1. Prerequisites
* Node.js >= 20.x
* PostgreSQL >= 15.x

### 2. Environment Setup
```bash
cp .env.example .env
```
Configure your `.env` variables:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/swift_doc?schema=public"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-jwt-refresh-secret"
```

### 3. Database Migration & Seeding
```bash
npm run prisma:migrate
npm run prisma:seed
```

### 4. Run Development Server
```bash
npm run dev
```
Access the API at `http://localhost:5000` and Swagger docs at `http://localhost:5000/docs`.

### 5. Running Tests & Typecheck
```bash
npm run test
npm run typecheck
npm run build
```

---

## 📖 Comprehensive Documentation

* [Architecture & Domain](docs/architecture.md)
* [Database Schema & Migrations](docs/database.md)
* [Authentication System](docs/authentication.md)
* [Two-Role Authorization (CLIENT & ADMIN)](docs/authorization.md)
* [Application Lifecycle & State Machine](docs/applications.md)
* [Service Catalog & Requirements](docs/services.md)
* [Document Domain & Cloudinary Storage](docs/documents.md)
* [Payment Domain & M-Pesa Daraja](docs/payments.md)
* [External Integrations & Abstractions](docs/integrations.md)
* [API Specification & Endpoints](docs/api.md)
* [Environment Configuration](docs/environment.md)
* [Phase 1 Forensic Assessment & Roadmap](docs/phase-1.md)
