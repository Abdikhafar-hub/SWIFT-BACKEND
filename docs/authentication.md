# Swift Doc Backend — Authentication System

## 1. Authentication Architecture

The Swift Doc backend implements an enterprise JWT authentication system with short-lived access tokens and single-use rotating refresh tokens.

* **Password Hashing**: `bcryptjs` with work factor salt of 12.
* **Access Tokens**: Short-lived (15 minutes by default), containing `userId`, `email`, `role`, `organizationId`, and `clientId`.
* **Refresh Tokens**: Long-lived (7 days by default), stored in the database (`RefreshToken` table) with hashed tokens, expiry timestamp, device/IP metadata, and rotation on every renewal.
* **Brute-Force Protection**: Tracking of `failedLoginAttempts` with temporary account locking on repeated failures.

## 2. API Endpoints

* `POST /api/v1/auth/register`: Public client account registration. Atomically creates a `User` with role `CLIENT` and an associated `Client` profile.
* `POST /api/v1/auth/login`: Authenticates user, verifies password hash, records audit log, and issues token pair.
* `POST /api/v1/auth/refresh`: Validates refresh token, invalidates old token, and issues new token pair (refresh token rotation).
* `POST /api/v1/auth/logout`: Revokes the provided refresh token and invalidates active session.
* `GET /api/v1/auth/me`: Returns current user identity and associated client profile.

## 3. Token Security Principles

* Access tokens are passed via the standard `Authorization: Bearer <token>` header.
* Refresh tokens are single-use; reusing an already-rotated token triggers security invalidation of the entire token family.
* Plaintext passwords and tokens are never logged or exposed in API responses or error stack traces.
