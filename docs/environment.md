# Swift Doc Backend — Environment Variables Configuration

The application validates all environment variables at startup using Zod in `src/config/env.ts`.

## Variable Matrix

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `string` | `development` | Runtime mode (`development`, `production`, `test`) |
| `PORT` | `number` | `5000` | HTTP port the Express server listens on |
| `API_PREFIX` | `string` | `/api/v1` | URL prefix for versioned API endpoints |
| `CORS_ORIGIN` | `string` | `*` | Comma-separated list of allowed origins |
| `DATABASE_URL` | `string` | Required | PostgreSQL connection string with schema parameter |
| `JWT_SECRET` | `string` | Required | Secret for signing short-lived access JWTs (>= 16 chars) |
| `JWT_EXPIRES_IN` | `string` | `15m` | Access token lifespan |
| `JWT_REFRESH_SECRET` | `string` | Required | Secret for signing long-lived refresh tokens (>= 16 chars) |
| `JWT_REFRESH_EXPIRES_IN`| `string` | `7d` | Refresh token lifespan |
| `CLOUDINARY_CLOUD_NAME` | `string` | Optional | Cloudinary account cloud name |
| `CLOUDINARY_API_KEY` | `string` | Optional | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | `string` | Optional | Cloudinary API Secret |
| `RESEND_API_KEY` | `string` | Optional | Resend transactional email API key |
| `EMAIL_FROM` | `string` | `notifications@swiftdoc.co.ke` | Verified outbound sender email address |
| `AFRICASTALKING_API_KEY`| `string` | Optional | Africa's Talking API key |
| `AFRICASTALKING_USERNAME`| `string` | `sandbox` | Africa's Talking application username |
| `AFRICASTALKING_FROM` | `string` | `SWIFTDOC` | Registered SMS alphanumeric sender ID |
| `MPESA_CONSUMER_KEY` | `string` | Optional | Safaricom Daraja Consumer Key |
| `MPESA_CONSUMER_SECRET` | `string` | Optional | Safaricom Daraja Consumer Secret |
| `MPESA_PASSKEY` | `string` | Optional | Safaricom Daraja Lipa Na M-Pesa Online passkey |
| `MPESA_SHORTCODE` | `string` | `174379` | Safaricom Business Shortcode / Paybill / Till |
| `MPESA_CALLBACK_URL` | `string` | Optional | Public webhook URL for Daraja callbacks |

## Development Mode Fallback

If third-party API keys (`CLOUDINARY`, `RESEND`, `AFRICASTALKING`, `MPESA`) are omitted or set to sandbox values, the backend automatically utilizes built-in Mock Providers without throwing startup errors.
