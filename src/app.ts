import express from "express";
import helmet from "helmet";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { NotFoundError } from "./common/errors/app-error.js";
import { openApiDocument } from "./docs/openapi.js";

// Import Module Routers
import { healthRoutes } from "./modules/health/health.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientProfileRoutes, adminClientRoutes, adminRegistrationRoutes } from "./modules/clients/clients.routes.js";
import { clientServiceRoutes, adminServiceRoutes } from "./modules/services/services.routes.js";
import { clientApplicationRoutes, adminApplicationRoutes } from "./modules/applications/applications.routes.js";
import { governmentRouter } from "./modules/government/government.routes.js";
import { clientActionsRouter } from "./modules/client-actions/client-actions.routes.js";
import { slaRouter } from "./modules/sla/sla.routes.js";
import { clientMessageRoutes, adminMessageRoutes } from "./modules/messages/messages.routes.js";
import { clientTimelineRoutes, adminTimelineRoutes } from "./modules/timeline/timeline.routes.js";
import { adminQualityRoutes } from "./modules/quality/quality.routes.js";
import { clientDeliveryRoutes, adminDeliveryRoutes } from "./modules/delivery/delivery.routes.js";
import { clientDashboardRoutes, adminDashboardRoutes } from "./modules/dashboards/dashboards.routes.js";
import { documentRouter } from "./modules/documents/documents.routes.js";
import { paymentRoutes, clientPaymentRoutes, paymentCallbackRoutes, adminPaymentRoutes } from "./modules/payments/payments.routes.js";
import { adminFinancialRoutes } from "./modules/financial/financial.routes.js";
import { clientInvoicesRoutes, adminInvoicesRoutes } from "./modules/financial/invoices.routes.js";
import { clientReceiptsRoutes, adminReceiptsRoutes } from "./modules/financial/receipts.routes.js";
import { adminRefundRoutes } from "./modules/financial/refunds.routes.js";
import { adminReconciliationRoutes } from "./modules/financial/reconciliation.routes.js";
import { notificationRouter, notificationRoutes } from "./modules/notifications/notifications.routes.js";
import { adminAuditRoutes } from "./modules/audit/audit.routes.js";

export const app = express();

// 1. Security & Core Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// 2. Health & Readiness Probes
app.use("/health", healthRoutes);

// 3. API Documentation (OpenAPI / Swagger UI)
app.get("/api/v1/openapi.json", (req, res) => {
  res.status(200).json(openApiDocument);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

// Root information endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    name: "Swift Doc Production Backend API",
    version: "5.0.0",
    status: "online",
    phase: "Phase 5 - Final Backend Completion, Integration, Hardening & Production Certification",
    docs: "/docs",
    health: "/health",
  });
});

// 4. API Version 1 Routers
const v1Router = express.Router();

// Auth Endpoints
v1Router.use("/auth", authRoutes);

// Client Portal Endpoints
v1Router.use("/client/dashboard", clientDashboardRoutes);
v1Router.use("/client/profile", clientProfileRoutes);
v1Router.use("/client/services", clientServiceRoutes);
v1Router.use("/client/applications", clientApplicationRoutes);
v1Router.use("/client/applications", clientMessageRoutes);
v1Router.use("/client/applications", clientTimelineRoutes);
v1Router.use("/client/applications", clientDeliveryRoutes);
v1Router.use("/client/notifications", notificationRoutes);
v1Router.use("/client/invoices", clientInvoicesRoutes);
v1Router.use("/client/receipts", clientReceiptsRoutes);
v1Router.use("/client/payments", clientPaymentRoutes);

// Shared / Cross-Domain Operations
v1Router.use(governmentRouter);
v1Router.use(clientActionsRouter);
v1Router.use(slaRouter);
v1Router.use(documentRouter);
v1Router.use(notificationRouter);

// Public / General Service Catalog
v1Router.use("/services", clientServiceRoutes);

// Payments & Webhooks
v1Router.use("/payments", paymentCallbackRoutes); // public callbacks
v1Router.use("/payments", paymentRoutes);

// Financial Commercial Operating Layer
v1Router.use("/financial", adminFinancialRoutes);

// Admin Operations Endpoints
v1Router.use("/admin/dashboard", adminDashboardRoutes);
v1Router.use("/admin/registrations", adminRegistrationRoutes);
v1Router.use("/admin/clients", adminClientRoutes);
v1Router.use("/admin/services", adminServiceRoutes);
v1Router.use("/admin/applications", adminApplicationRoutes);
v1Router.use("/admin/applications", adminMessageRoutes);
v1Router.use("/admin/applications", adminTimelineRoutes);
v1Router.use("/admin/quality", adminQualityRoutes);
v1Router.use("/admin/delivery", adminDeliveryRoutes);
v1Router.use("/admin/payments", adminPaymentRoutes);
v1Router.use("/admin/financial", adminFinancialRoutes);
v1Router.use("/admin/invoices", adminInvoicesRoutes);
v1Router.use("/admin/receipts", adminReceiptsRoutes);
v1Router.use("/admin/refunds", adminRefundRoutes);
v1Router.use("/admin/reconciliation", adminReconciliationRoutes);
v1Router.use("/admin/audit-logs", adminAuditRoutes);

// Mount /api/v1
app.use(env.API_PREFIX, v1Router);


// 5. 404 Handler
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
});

// 6. Centralized Error Handler
app.use(errorHandler);

export default app;
