# Swift Doc Backend — Payment Domain & M-Pesa Daraja Integration

## 1. Financial Precision & Accounting Principles

* **Decimal Currency Handling**: Built with `Prisma.Decimal` (mapped to PostgreSQL `DECIMAL(12, 2)`) to eliminate floating-point arithmetic errors.
* **Currency**: Standard Kenyan Shillings (`KES`).
* **Itemized Ledger**: Every payment maintains explicit itemization:
  * `governmentFee`: Statutory disbursement (e.g. KES 10,650 for company registration).
  * `serviceFee`: Swift Doc processing fee (e.g. KES 5,500).
  * `otherFee`: Ancillary charges (e.g. expedited dispatch).
  * `discount`: Promotional or corporate discount.
  * `tax`: Applicable VAT on service fees.
  * `totalAmount = governmentFee + serviceFee + otherFee + tax - discount`.
  * `amountPaid` & `amountDue`.

## 2. Safaricom M-Pesa Daraja Integration

The payment subsystem features full support for Safaricom Daraja STK Push (Lipa Na M-Pesa Online) with provider abstraction:

```text
[Client Initiates Payment]
       │
       ▼
POST /api/v1/payments/mpesa/stkpush
       │
       ▼
[M-Pesa Daraja Provider] ──► [Safaricom Daraja API] ──► [Client Phone Prompts PIN]
                                                               │
                                                               ▼
[Safaricom Webhook] ◄─────────────────────────────────── [PIN Entered]
       │
       ▼
POST /api/v1/payments/mpesa/callback (Idempotent Webhook Handler)
       │
       ▼
[Find Payment by CheckoutRequestID]
       │
       ▼
[Create PaymentTransaction (MPESA_RECEIPT)]
       │
       ▼
[Update Payment amountPaid, amountDue, and Status: COMPLETED / PARTIAL]
       │
       ▼
[Send Email & SMS Notification + Append Audit Log]
```

## 3. Webhook Idempotency

* M-Pesa callbacks are verified and processed idempotently. If Safaricom retries a callback for the same transaction reference (`MpesaReceiptNumber`), the duplicate payload is safely acknowledged without duplicate ledger crediting.
