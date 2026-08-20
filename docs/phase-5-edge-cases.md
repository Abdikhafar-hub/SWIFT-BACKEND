# Swift Doc Backend — Phase 5 Edge Case Matrix

This document defines the comprehensive edge case matrix for the Swift Doc backend, detailing expected behavior, system guards, and automated test coverage across all core domains.

---

## Edge Case Matrix

| Domain | Scenario / Edge Case | Expected System Behavior | System Guard / Implementation | Test Coverage |
|---|---|---|---|---|
| **1. Auth** | Expired Access Token | Rejects request with `401 Unauthorized`. | JWT expiration check in `authenticateToken`. | `tests/security/phase5-security-idor.test.ts` |
| **1. Auth** | Refresh Token Reuse / Tampering | Rejects refresh and invalidates session token family. | SHA-256 token hashing and rotation validation in `AuthService.refreshToken`. | `tests/security/phase5-security-idor.test.ts` |
| **1. Auth** | Rate Limiting on Login | Returns `429 Too Many Requests` after excessive failed attempts. | `express-rate-limit` middleware on `/api/v1/auth/login`. | `tests/security/phase5-security-idor.test.ts` |
| **2. Clients** | Cross-Client Profile Access (IDOR) | Client B querying Client A's profile receives `403 Forbidden` or `404 Not Found`. | Client ID extracted from verified JWT, not request params. | `tests/security/phase5-security-idor.test.ts` |
| **3. Catalog** | Service Definition Modified After App Creation | Historical application requirements remain unchanged. | Application creates immutable snapshot in `ApplicationRequirement` table on creation. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **4. Applications** | Arbitrary State Transition (e.g. `NEW` $\rightarrow$ `DELIVERED`) | Rejects transition with `400 Bad Request`. | `ApplicationStateMachine.validateTransition` enforces state graph prerequisites. | `tests/integration/phase2-lifecycle.test.ts` |
| **4. Applications** | Concurrent Application Submission | Both create unique application numbers; duplicate submissions detect collisions. | PostgreSQL unique constraints and `generateApplicationNumber` transaction locking. | `tests/concurrency/phase5-concurrency.test.ts` |
| **5. Requirements** | Submitting Invalid Requirement Data Type | Rejects with `400 Bad Request` validation error. | Zod schema validation matching `RequirementType` (TEXT, NUMBER, DATE, etc.). | `tests/integration/phase2-catalog-validation.test.ts` |
| **6. Documents** | Client Attempting to Download Another Client's Document | Returns `403 Forbidden`. | Document ownership check verifying `document.application.clientId === req.user.clientId`. | `tests/security/phase5-security-idor.test.ts` |
| **6. Documents** | Re-uploading Rejected Document | Creates a new version without deleting previous historical version. | `document.version` increment with status reset to `PENDING`. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **7. Government** | External Government Rejection / Correction Request | Transitions application to `CLIENT_ACTION_REQUIRED` and creates actionable request. | `GovernmentService.recordGovernmentUpdate` triggers automated action creation. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **8. Client Actions** | SLA Pausing on Action Creation | Active SLA timer pauses while waiting for client response. | `SlaService.pauseSla` called on action creation. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **8. Client Actions** | SLA Resuming on Action Resolution | SLA timer resumes and recalculated due date is saved. | `SlaService.resumeSla` recalculates deadline based on paused duration. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **9. SLA** | Overdue SLA Detection | Periodic background sweep identifies overdue apps and triggers alerts. | `runSlaMonitorJob` sweeps applications and logs `SlaEventType.DEADLINE_RECALCULATED`. | `tests/unit/sla-engine.test.ts` |
| **10. Notifications**| External Email / SMS Provider Outage | Primary transaction completes successfully; notification failure logged independently. | Try-catch isolation in `NotificationOrchestrator` methods. | `tests/integration/phase5-e2e-client-journey.test.ts` |
| **11. Invoices** | Paying Already Paid Invoice | Rejects payment with `400 Bad Request`. | `amountDue <= 0` and status `PAID` checks in `PaymentService`. | `tests/integration/phase5-financial-e2e.test.ts` |
| **11. Invoices** | Applying Discount Exceeding Total Balance | Rejects adjustment with `400 Bad Request`. | `amountDue.sub(discount) >= 0` check in `InvoicesService.applyAdjustment`. | `tests/integration/phase5-financial-e2e.test.ts` |
| **12. Payments** | Duplicate M-Pesa STK Callback | Ignores duplicate callback without creating second financial credit or receipt. | Transaction status and `mpesaReceiptNumber` idempotency checks. | `tests/integration/phase5-financial-e2e.test.ts`, `tests/concurrency/phase5-concurrency.test.ts` |
| **12. Payments** | Partial Payment Installments | Updates `amountPaid` and `amountDue`, sets status `PARTIALLY_PAID`. | Decimal arithmetic in transaction balance updater. | `tests/integration/phase5-financial-e2e.test.ts` |
| **13. Receipts** | Idempotent Receipt Generation | Exactly one receipt generated per payment transaction. | Unique `transactionId` relation on `Receipt` table. | `tests/integration/phase4-financial-engine.test.ts` |
| **14. Reversals** | Reversing a Payment Transaction | Original transaction marked `REVERSED`, reversal record created, balance restored. | Transactional reversal in `PaymentService.reversePaymentTransaction`. | `tests/integration/phase4-financial-engine.test.ts` |
| **15. Reconciliation** | Unmatched Statement Entry | Stored in `StatementEntry` table as `UNMATCHED` for manual admin resolution. | Automated matcher logs status and leaves entry open. | `tests/integration/phase4-financial-engine.test.ts` |
| **16. Audit** | Sensitive Payload Leakage | Passwords, card tokens, raw hashes excluded from audit metadata. | `recordAuditLog` sanitizes metadata fields before database insert. | `tests/security/phase5-security-idor.test.ts` |
| **17. Notes** | Internal Admin Note Leakage to Client | Clients only receive notes with `NoteVisibility.CLIENT_VISIBLE`. | Query filter `{ visibility: NoteVisibility.CLIENT_VISIBLE }` on client endpoints. | `tests/security/phase5-security-idor.test.ts` |
| **18. Jobs** | Background Job Failure & Retry | Failed job marked `FAILED` after max attempts with exponential backoff. | `JobQueueService.processPendingJobs` manages attempt count and backoff delay. | `tests/integration/phase5-e2e-client-journey.test.ts` |
