# Swift Doc Backend — External Integrations & Provider Abstractions

## 1. Provider Isolation Architecture

All third-party external services are cleanly abstracted behind strict TypeScript interfaces. Application code never imports external SDKs directly, ensuring zero vendor lock-in and seamless testability.

## 2. Supported Integrations

### 1. Storage (`src/infrastructure/storage`)
* **Interface**: `IStorageProvider`
  * `uploadFile(file: Buffer, filename: string, mimeType: string, folder?: string)`
  * `deleteFile(fileKey: string)`
  * `getSignedUrl(fileKey: string, expiresInSeconds?: number)`
* **Implementations**:
  * `CloudinaryStorageProvider`: Uses official Cloudinary API.
  * `MockStorageProvider`: Deterministic in-memory file repository for testing without network dependencies.

### 2. Transactional Email (`src/infrastructure/email`)
* **Interface**: `IEmailProvider`
  * `sendEmail(to: string, subject: string, html: string, text?: string)`
* **Implementations**:
  * `ResendEmailProvider`: Sends production emails via Resend API.
  * `MockEmailProvider`: Captures outbound emails in memory for assertion during test runs.

### 3. Transactional SMS (`src/infrastructure/sms`)
* **Interface**: `ISmsProvider`
  * `sendSms(to: string, message: string)`
* **Implementations**:
  * `AfricasTalkingSmsProvider`: Dispatches SMS via Africa's Talking gateway in East Africa (`+254...`).
  * `MockSmsProvider`: In-memory logger for test environments.

### 4. Payments (`src/infrastructure/payments`)
* **Interface**: `IPaymentProvider`
  * `initiateStkPush(params: StkPushParams)`
  * `queryTransactionStatus(checkoutRequestId: string)`
* **Implementations**:
  * `MpesaDarajaPaymentProvider`: Interacts with Safaricom Daraja OAuth2 + Lipa Na M-Pesa Online endpoint.
  * `MockPaymentProvider`: Generates instant simulated M-Pesa STK prompts and receipts.
