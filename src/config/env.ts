import dotenv from "dotenv";
import { z } from "zod";
import path from "path";

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://localhost:5173"),

  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),

  CLOUDINARY_CLOUD_NAME: z.string().default("mock_cloud_name"),
  CLOUDINARY_API_KEY: z.string().default("mock_api_key"),
  CLOUDINARY_API_SECRET: z.string().default("mock_api_secret"),

  RESEND_API_KEY: z.string().default("mock_resend_api_key"),
  RESEND_FROM_EMAIL: z.string().email().default("notifications@swiftdoc.co.ke"),

  AT_API_KEY: z.string().default("mock_at_api_key"),
  AT_USERNAME: z.string().default("mock_at_username"),
  AT_SENDER_ID: z.string().default("SWIFTDOC"),

  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().default("mock_mpesa_consumer_key"),
  MPESA_CONSUMER_SECRET: z.string().default("mock_mpesa_consumer_secret"),
  MPESA_SHORTCODE: z.string().default("174379"),
  MPESA_PASSKEY: z.string().default("mock_mpesa_passkey"),
  MPESA_CALLBACK_URL: z.string().url().default("https://api.swiftdoc.co.ke/api/v1/payments/callbacks/mpesa"),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. Fix .env file.");
  }
  return result.data;
};

export const env = parseEnv();
export type Environment = z.infer<typeof envSchema>;
