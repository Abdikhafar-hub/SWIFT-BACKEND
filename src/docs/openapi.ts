export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Swift Doc Production API",
    version: "5.0.0",
    description:
      "Enterprise Kenyan government documentation, business compliance, client tracking, and financial operating engine API. Phase 5 Production Certified.",
    contact: {
      name: "Swift Doc Engineering",
      email: "info@swiftdoc.co.ke",
      url: "https://swiftdoc.co.ke",
    },
  },
  servers: [
    {
      url: "http://localhost:5000/api/v1",
      description: "Local Development Server (API v1)",
    },
    {
      url: "https://app.swiftdoc.co.ke/api/v1",
      description: "Production VPS Server (API v1)",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JWT bearer authorization token.",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "NOT_FOUND" },
              message: { type: "string", example: "Requested resource not found" },
              details: { type: "object", nullable: true },
            },
            required: ["code", "message"],
          },
        },
        required: ["success", "error"],
      },
      PaginationMeta: {
        type: "object",
        properties: {
          total: { type: "integer", example: 42 },
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          totalPages: { type: "integer", example: 3 },
          hasNextPage: { type: "boolean", example: true },
          hasPrevPage: { type: "boolean", example: false },
        },
        required: ["total", "page", "limit", "totalPages"],
      },
      Application: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          applicationNumber: { type: "string", example: "SD-APP-2026-000001" },
          organizationId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          serviceId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: [
              "NEW",
              "QUALIFICATION",
              "REQUIREMENTS_PENDING",
              "DOCUMENT_REVIEW",
              "READY_FOR_SUBMISSION",
              "SUBMITTED",
              "GOVERNMENT_PROCESSING",
              "ADDITIONAL_INFORMATION_REQUIRED",
              "CLIENT_ACTION_REQUIRED",
              "APPROVED",
              "DOCUMENT_RECEIVED",
              "QUALITY_CHECK",
              "READY_FOR_DELIVERY",
              "DELIVERED",
              "CLOSED",
              "ON_HOLD",
              "CANCELLED",
            ],
          },
          priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
          slaStatus: { type: "string", enum: ["ON_TRACK", "AT_RISK", "OVERDUE", "PAUSED", "COMPLETED"] },
          totalAmount: { type: "string", example: "16150.00" },
          paidAmount: { type: "string", example: "0.00" },
          dueAmount: { type: "string", example: "16150.00" },
          currency: { type: "string", example: "KES" },
          startedAt: { type: "string", format: "date-time" },
          dueAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          invoiceNumber: { type: "string", example: "SD-INV-2026-000001" },
          organizationId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid", nullable: true },
          governmentFee: { type: "string", example: "10000.00" },
          serviceFee: { type: "string", example: "5000.00" },
          otherFee: { type: "string", example: "350.00" },
          discount: { type: "string", example: "0.00" },
          tax: { type: "string", example: "800.00" },
          subtotal: { type: "string", example: "15350.00" },
          totalAmount: { type: "string", example: "16150.00" },
          amountPaid: { type: "string", example: "16150.00" },
          amountDue: { type: "string", example: "0.00" },
          currency: { type: "string", example: "KES" },
          status: {
            type: "string",
            enum: ["DRAFT", "ISSUED", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "VOID"],
          },
          dueAt: { type: "string", format: "date-time" },
          paidAt: { type: "string", format: "date-time", nullable: true },
          cancelledAt: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
          lineItems: {
            type: "array",
            items: { $ref: "#/components/schemas/InvoiceLineItem" },
          },
        },
      },
      InvoiceLineItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          paymentId: { type: "string", format: "uuid" },
          description: { type: "string", example: "Official BRS Filing Statutory Fee" },
          itemType: { type: "string", enum: ["GOVERNMENT_FEE", "SERVICE_FEE", "DISBURSEMENT", "TAX", "OTHER"] },
          quantity: { type: "integer", example: 1 },
          unitPrice: { type: "string", example: "10000.00" },
          amount: { type: "string", example: "10000.00" },
          isGovernmentFee: { type: "boolean", example: true },
          isTaxable: { type: "boolean", example: false },
        },
      },
      PaymentTransaction: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          paymentId: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid", nullable: true },
          transactionNumber: { type: "string", example: "SD-TXN-2026-000001" },
          transactionType: { type: "string", enum: ["PAYMENT", "REVERSAL", "REFUND", "ADJUSTMENT"] },
          paymentMethod: { type: "string", enum: ["MPESA", "BANK_TRANSFER", "CARD", "CASH", "CHEQUE", "INTERNAL_CREDIT"] },
          amount: { type: "string", example: "16150.00" },
          currency: { type: "string", example: "KES" },
          status: { type: "string", enum: ["PENDING", "COMPLETED", "FAILED", "REVERSED", "PAID"] },
          externalReference: { type: "string", example: "QKH76XZ12" },
          providerReference: { type: "string", nullable: true },
          paidAt: { type: "string", format: "date-time", nullable: true },
          failureReason: { type: "string", nullable: true },
        },
      },
      Receipt: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          receiptNumber: { type: "string", example: "SD-REC-2026-000001" },
          organizationId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          paymentId: { type: "string", format: "uuid" },
          transactionId: { type: "string", format: "uuid" },
          amount: { type: "string", example: "16150.00" },
          currency: { type: "string", example: "KES" },
          paymentMethod: { type: "string", enum: ["MPESA", "BANK_TRANSFER", "CARD", "CASH", "CHEQUE", "INTERNAL_CREDIT"] },
          transactionReference: { type: "string", example: "QKH76XZ12" },
          payerName: { type: "string", example: "John Kamau" },
          amountPaid: { type: "string", example: "16150.00" },
          remainingBalance: { type: "string", example: "0.00" },
          issuedAt: { type: "string", format: "date-time" },
        },
      },
      Refund: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          refundNumber: { type: "string", example: "SD-REF-2026-000001" },
          organizationId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          paymentId: { type: "string", format: "uuid" },
          transactionId: { type: "string", format: "uuid" },
          amount: { type: "string", example: "5000.00" },
          currency: { type: "string", example: "KES" },
          reason: { type: "string", example: "Client requested partial cancellation" },
          status: { type: "string", enum: ["REQUESTED", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "CANCELLED"] },
          requestedById: { type: "string", format: "uuid" },
          approvedById: { type: "string", format: "uuid", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          processedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      FinancialAdjustment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          adjustmentNumber: { type: "string", example: "SD-ADJ-2026-000001" },
          organizationId: { type: "string", format: "uuid" },
          paymentId: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["DISCOUNT", "WAIVER", "ADDITIONAL_CHARGE", "PENALTY", "FEE_ADJUSTMENT"] },
          amount: { type: "string", example: "500.00" },
          reason: { type: "string", example: "Loyalty concession" },
          appliedAt: { type: "string", format: "date-time" },
        },
      },
      ReconciliationRecord: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          transactionId: { type: "string", format: "uuid", nullable: true },
          reference: { type: "string", example: "QKH76XZ12" },
          amount: { type: "string", example: "16150.00" },
          currency: { type: "string", example: "KES" },
          provider: { type: "string", example: "MPESA" },
          status: { type: "string", enum: ["UNMATCHED", "MATCHED", "DISCREPANCY", "SUSPICIOUS", "REVERSED", "DUPLICATE"] },
          reconciledAt: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      ClientAction: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["UPLOAD_DOCUMENT", "REPLACE_DOCUMENT", "PROVIDE_INFORMATION", "PAYMENT_REQUIRED", "VERIFY_IDENTITY", "SIGN_DOCUMENT", "OTHER"] },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
          status: { type: "string", enum: ["OPEN", "COMPLETED", "CANCELLED", "OVERDUE"] },
          dueAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      GovernmentApplication: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid" },
          platform: { type: "string", example: "BRS" },
          governmentAgency: { type: "string", example: "Business Registration Service" },
          status: { type: "string", enum: ["NOT_STARTED", "SUBMITTED", "UNDER_REVIEW", "QUERY_RAISED", "RESUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"] },
          externalReference: { type: "string", example: "BRS-2026-98124" },
          externalApplicationNumber: { type: "string", nullable: true },
          governmentOfficer: { type: "string", nullable: true },
          submittedAt: { type: "string", format: "date-time", nullable: true },
          approvedAt: { type: "string", format: "date-time", nullable: true },
          nextFollowUpDate: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        summary: "Register new client account",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fullName: { type: "string", example: "John Kamau" },
                  email: { type: "string", format: "email", example: "john@example.com" },
                  phone: { type: "string", example: "+254712345678" },
                  password: { type: "string", format: "password", minLength: 8, example: "Secret@1234!" },
                  clientType: { type: "string", enum: ["INDIVIDUAL", "BUSINESS", "ORGANIZATION"] },
                  nationalId: { type: "string", nullable: true },
                  kraPin: { type: "string", nullable: true },
                },
                required: ["fullName", "email", "phone", "password"],
              },
            },
          },
        },
        responses: {
          "201": { description: "User and Client registered successfully" },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Authenticate user and return JWT tokens",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", example: "admin@swiftdoc.co.ke" },
                  password: { type: "string", format: "password", example: "Admin@SwiftDoc2026!" },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Authentication successful with access & refresh tokens" },
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        summary: "Request password reset link",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", example: "client@example.com" },
                },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Password reset request accepted" },
        },
      },
    },
    "/auth/reset-password": {
      post: {
        summary: "Confirm password reset using token",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
                  newPassword: { type: "string", format: "password", minLength: 8, example: "NewSecurePassword123!" },
                },
                required: ["token", "newPassword"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Password reset completed successfully" },
        },
      },
    },
    "/auth/change-password": {
      post: {
        summary: "Change password for authenticated user",
        tags: ["Authentication"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  currentPassword: { type: "string", format: "password" },
                  newPassword: { type: "string", format: "password", minLength: 8 },
                },
                required: ["currentPassword", "newPassword"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Password changed successfully" },
        },
      },
    },
    "/auth/verify-otp": {
      post: {
        summary: "Verify account email with OTP code",
        tags: ["Authentication"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  code: { type: "string", example: "123456" },
                },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Email successfully verified" },
        },
      },
    },
    "/auth/resend-otp": {
      post: {
        summary: "Resend email verification OTP code",
        tags: ["Authentication"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "OTP code sent" },
        },
      },
    },
    "/client/actions/open": {
      get: {
        summary: "Get all open pending action items for the client",
        tags: ["Client Actions"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "List of open client action items" },
        },
      },
    },
    "/applications/{applicationId}/actions": {
      get: {
        summary: "List all action items for a specific application",
        tags: ["Client Actions"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Action items list" },
        },
      },
    },
    "/actions/{id}/complete": {
      post: {
        summary: "Complete a client action item with response data and auto-resume SLA",
        tags: ["Client Actions"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  responseNotes: { type: "string" },
                  responseData: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Action completed and application resumed" },
        },
      },
    },
    "/admin/applications/{applicationId}/actions": {
      post: {
        summary: "Create a required client action item and auto-pause SLA",
        tags: ["Client Actions"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["UPLOAD_DOCUMENT", "REPLACE_DOCUMENT", "PROVIDE_INFORMATION", "PAYMENT_REQUIRED", "VERIFY_IDENTITY", "SIGN_DOCUMENT", "OTHER"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
                  dueAt: { type: "string", format: "date-time" },
                  requirementId: { type: "string", format: "uuid" },
                },
                required: ["type", "title", "description"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Client action created and client notified" },
        },
      },
    },
    "/admin/government-applications/queue": {
      get: {
        summary: "Query government submissions work queue with overdue & follow-up tracking",
        tags: ["Government Processing"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "platform", in: "query", schema: { type: "string" } },
          { name: "assignedAdminId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "followUpDue", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: {
          "200": { description: "Government work queue items and summary statistics" },
        },
      },
    },
    "/admin/government-applications/{id}/request-info": {
      post: {
        summary: "Process official government query and request required information/documents from client",
        tags: ["Government Processing"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  queryType: { type: "string", enum: ["CLARIFICATION", "ADDITIONAL_DOCUMENTS", "NAME_REJECTION", "PAYMENT_QUERY", "CORRECTION_REQUIRED", "OTHER"] },
                  queryDetails: { type: "string" },
                  deadline: { type: "string", format: "date-time" },
                  actionItemTitle: { type: "string" },
                  actionItemDescription: { type: "string" },
                },
                required: ["queryType", "queryDetails", "actionItemTitle"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Government query recorded, client action dispatched, SLA paused" },
        },
      },
    },
    "/admin/government-applications/{id}/resubmit": {
      post: {
        summary: "Record resubmission of resolved application back to government agency",
        tags: ["Government Processing"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  notes: { type: "string" },
                  newReference: { type: "string" },
                  expectedCompletionAt: { type: "string", format: "date-time" },
                },
                required: ["notes"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Government application resubmitted and SLA tracking updated" },
        },
      },
    },
    "/admin/government-applications/{id}/approve": {
      post: {
        summary: "Record official government approval / certificate clearance",
        tags: ["Government Processing"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  officialDocumentNumber: { type: "string" },
                  approvalNotes: { type: "string" },
                  approvedAt: { type: "string", format: "date-time" },
                },
                required: ["approvalNotes"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Government clearance recorded and application moved to Document Received / QC" },
        },
      },
    },
    "/admin/applications/work-queue": {
      get: {
        summary: "Comprehensive multi-facet administrative work queue with live bucket counts",
        tags: ["Admin Operations"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "assignedAdminId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "slaStatus", in: "query", schema: { type: "string" } },
          { name: "needsAttention", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Work queue applications list and live bucket counts" },
        },
      },
    },
    "/admin/applications/{id}/priority": {
      patch: {
        summary: "Update application priority (LOW, NORMAL, HIGH, URGENT)",
        tags: ["Admin Operations"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
                  reason: { type: "string" },
                },
                required: ["priority"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Application priority updated" },
        },
      },
    },
    "/admin/applications/{id}/close": {
      post: {
        summary: "Formally close completed or resolved application",
        tags: ["Admin Operations"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string" },
                  completionNotes: { type: "string" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Application formally closed" },
        },
      },
    },
    "/admin/applications/{id}/sla/pause": {
      post: {
        summary: "Pause application SLA timer with reason and category",
        tags: ["SLA Engine"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string" },
                  category: { type: "string", enum: ["CLIENT_WAITING", "GOVERNMENT_WAITING", "INTERNAL"] },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "SLA timer paused and event recorded" },
        },
      },
    },
    "/admin/applications/{id}/sla/resume": {
      post: {
        summary: "Resume application SLA timer and recalculate due date",
        tags: ["SLA Engine"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "SLA timer resumed and due date extended" },
        },
      },
    },
    "/applications/{id}/sla-timeline": {
      get: {
        summary: "Get detailed SLA timeline breakdown and duration audit",
        tags: ["SLA Engine"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "SLA breakdown and event timeline" },
        },
      },
    },
    "/client/notifications/preferences": {
      get: {
        summary: "Get current user notification delivery channel preferences",
        tags: ["Notifications"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "User notification preferences" },
        },
      },
      patch: {
        summary: "Update user notification delivery preferences",
        tags: ["Notifications"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  emailEnabled: { type: "boolean" },
                  smsEnabled: { type: "boolean" },
                  inAppEnabled: { type: "boolean" },
                  marketingEnabled: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Preferences updated" },
        },
      },
    },
    "/client/invoices": {
      get: {
        summary: "List invoices for the authenticated client with pagination & filters",
        tags: ["Invoices (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paginated list of client invoices" },
        },
      },
    },
    "/client/invoices/{id}": {
      get: {
        summary: "Get specific invoice details for client with ownership enforcement",
        tags: ["Invoices (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Invoice details with line items and summary breakdown" },
        },
      },
    },
    "/client/invoices/{id}/transactions": {
      get: {
        summary: "Get payment transaction history for a specific invoice",
        tags: ["Invoices (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "List of transactions associated with this invoice" },
        },
      },
    },
    "/client/invoices/{id}/pay-mpesa": {
      post: {
        summary: "Initiate M-Pesa STK push for invoice payment",
        tags: ["Invoices (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  phoneNumber: { type: "string", example: "254712345678" },
                  amount: { type: "number", example: 16150 },
                  idempotencyKey: { type: "string", example: "IDEMP-INV-001" },
                },
                required: ["phoneNumber"],
              },
            },
          },
        },
        responses: {
          "200": { description: "STK push initiated and CheckoutRequestID returned" },
        },
      },
    },
    "/client/receipts": {
      get: {
        summary: "List all issued payment receipts for the client",
        tags: ["Receipts (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Paginated list of receipts" },
        },
      },
    },
    "/client/receipts/{id}": {
      get: {
        summary: "Get official receipt details for printing/downloading",
        tags: ["Receipts (Client)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Official receipt details" },
        },
      },
    },
    "/payments/mpesa/stkpush": {
      post: {
        summary: "Direct STK push initiation for application or standalone payment",
        tags: ["Payments"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  applicationId: { type: "string", format: "uuid" },
                  invoiceId: { type: "string", format: "uuid" },
                  phoneNumber: { type: "string", example: "254712345678" },
                  amount: { type: "number", example: 16150 },
                  idempotencyKey: { type: "string" },
                },
                required: ["phoneNumber", "amount"],
              },
            },
          },
        },
        responses: {
          "200": { description: "STK push initiated" },
        },
      },
    },
    "/payments/callbacks/mpesa": {
      post: {
        summary: "Public webhook callback for Safaricom Daraja M-Pesa STK Push results",
        tags: ["Payments"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  Body: {
                    type: "object",
                    properties: {
                      stkCallback: {
                        type: "object",
                        properties: {
                          MerchantRequestID: { type: "string" },
                          CheckoutRequestID: { type: "string" },
                          ResultCode: { type: "integer" },
                          ResultDesc: { type: "string" },
                          CallbackMetadata: { type: "object" },
                        },
                        required: ["MerchantRequestID", "CheckoutRequestID", "ResultCode", "ResultDesc"],
                      },
                    },
                    required: ["stkCallback"],
                  },
                },
                required: ["Body"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Webhook acknowledged" },
        },
      },
    },
    "/admin/invoices": {
      get: {
        summary: "Admin query of all invoices across clients with comprehensive filters",
        tags: ["Invoices (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "clientId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "applicationId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "isOverdue", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paginated list of invoices with client details" },
        },
      },
      post: {
        summary: "Create a new commercial invoice with itemized fee lines",
        tags: ["Invoices (Admin)"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  clientId: { type: "string", format: "uuid" },
                  applicationId: { type: "string", format: "uuid" },
                  lineItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        itemType: { type: "string", enum: ["GOVERNMENT_FEE", "SERVICE_FEE", "DISBURSEMENT", "TAX", "OTHER"] },
                        quantity: { type: "integer", default: 1 },
                        unitPrice: { type: "number" },
                        isGovernmentFee: { type: "boolean" },
                        isTaxable: { type: "boolean" },
                      },
                      required: ["description", "unitPrice"],
                    },
                  },
                  discount: { type: "number", default: 0 },
                  otherFee: { type: "number", default: 0 },
                  tax: { type: "number", default: 0 },
                  dueInDays: { type: "integer", default: 7 },
                  notes: { type: "string" },
                },
                required: ["clientId", "lineItems"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Invoice created" },
        },
      },
    },
    "/admin/invoices/{id}/issue": {
      post: {
        summary: "Formally issue a DRAFT invoice to the client and send notification",
        tags: ["Invoices (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  dueAt: { type: "string", format: "date-time" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Invoice issued to client" },
        },
      },
    },
    "/admin/invoices/{id}/cancel": {
      post: {
        summary: "Cancel an unpaid or draft invoice",
        tags: ["Invoices (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Client requested alternative service package" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Invoice cancelled" },
        },
      },
    },
    "/admin/invoices/{id}/adjust": {
      post: {
        summary: "Apply financial adjustment (discount, waiver, fee addition) to invoice",
        tags: ["Invoices (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["DISCOUNT", "WAIVER", "ADDITIONAL_CHARGE", "PENALTY", "FEE_ADJUSTMENT"] },
                  amount: { type: "number", example: 500 },
                  reason: { type: "string", example: "Management goodwill discount" },
                },
                required: ["type", "amount", "reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Adjustment applied and invoice balance updated" },
        },
      },
    },
    "/admin/payments/manual": {
      post: {
        summary: "Record manual payment (Cash, Direct Bank Transfer, Cheque, Card)",
        tags: ["Payments (Admin)"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  invoiceId: { type: "string", format: "uuid" },
                  applicationId: { type: "string", format: "uuid" },
                  paymentMethod: { type: "string", enum: ["BANK_TRANSFER", "CARD", "CASH", "CHEQUE"] },
                  amount: { type: "number", example: 16150 },
                  externalReference: { type: "string", example: "FT2611099238" },
                  notes: { type: "string" },
                  idempotencyKey: { type: "string" },
                },
                required: ["invoiceId", "paymentMethod", "amount", "externalReference", "idempotencyKey"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Payment recorded, invoice credited, receipt generated" },
        },
      },
    },
    "/admin/payments/transactions/{id}/reverse": {
      post: {
        summary: "Reverse a completed transaction (creates compensating reversal transaction)",
        tags: ["Payments (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Bank chargeback / Cheque bounced" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Transaction reversed and invoice balance restored" },
        },
      },
    },
    "/admin/refunds": {
      get: {
        summary: "List all refund requests and statuses",
        tags: ["Refunds (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "clientId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Refunds list" },
        },
      },
      post: {
        summary: "Request a refund for an invoice transaction",
        tags: ["Refunds (Admin)"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  paymentId: { type: "string", format: "uuid" },
                  transactionId: { type: "string", format: "uuid" },
                  amount: { type: "number", example: 5000 },
                  reason: { type: "string", example: "Government rejected name, client opted not to re-apply" },
                },
                required: ["paymentId", "transactionId", "amount", "reason"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Refund requested" },
        },
      },
    },
    "/admin/refunds/{id}/approve": {
      post: {
        summary: "Approve and process refund atomically",
        tags: ["Refunds (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Refund processed and ledger updated" },
        },
      },
    },
    "/admin/reconciliation": {
      get: {
        summary: "List bank/M-Pesa reconciliation records and status",
        tags: ["Reconciliation (Admin)"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "provider", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Reconciliation records list" },
        },
      },
    },
    "/admin/reconciliation/statement": {
      post: {
        summary: "Ingest external statement/M-Pesa settlement line item",
        tags: ["Reconciliation (Admin)"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reference: { type: "string", example: "QKH76XZ12" },
                  amount: { type: "number", example: 16150 },
                  provider: { type: "string", default: "MPESA" },
                  notes: { type: "string" },
                },
                required: ["reference", "amount"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Statement record created and auto-matched if transaction found" },
        },
      },
    },
    "/admin/reconciliation/engine/run": {
      post: {
        summary: "Trigger automated batch reconciliation matching engine across all unmatched records",
        tags: ["Reconciliation (Admin)"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Batch reconciliation summary with matched, suspicious, and duplicate counts" },
        },
      },
    },
    "/admin/financial/summary": {
      get: {
        summary: "Executive financial summary: Invoiced, Collected, Outstanding, Overdue, Net Revenue, Status breakdown",
        tags: ["Financial Analytics"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "fromDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "toDate", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": { description: "Executive financial summary metrics and distribution" },
        },
      },
    },
    "/admin/financial/collections": {
      get: {
        summary: "Collections breakdown aggregated by payment method (M-Pesa, Bank, Card, Cash)",
        tags: ["Financial Analytics"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Collections breakdown by payment method" },
        },
      },
    },
    "/admin/financial/outstanding": {
      get: {
        summary: "Aging schedule and outstanding unpaid invoices list (1-7, 8-14, 15-30, 30+ days)",
        tags: ["Financial Analytics"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "agingBucket", in: "query", schema: { type: "string", enum: ["1-7", "8-14", "15-30", "30+"] } },
        ],
        responses: {
          "200": { description: "Aging schedule of outstanding invoices" },
        },
      },
    },
    "/admin/financial/overdue": {
      get: {
        summary: "List invoices past their due date requiring collection follow-up",
        tags: ["Financial Analytics"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Overdue invoices requiring action" },
        },
      },
    },
  },
};

