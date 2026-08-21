import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { recordAuditLog, sanitizeAuditData } from "../../src/common/utils/audit.js";
import { auditService } from "../../src/modules/audit/audit.service.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { UserRole } from "@prisma/client";

describe("Admin Audit Trail Integration Test Suite", () => {
  let testOrgId: string;
  const testAdminId = "test-admin-456";
  const testAdminEmail = "admin-audit-test@swiftdoc.co.ke";

  beforeAll(async () => {
    // Fetch or create an organization for test isolation
    let org = await prisma.organization.findFirst();
    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: "Audit Trail Test Org",
          code: "AUDIT-ORG-TEST",
        },
      });
    }
    testOrgId = org.id;

    // Clear previous test audit logs for this org
    await prisma.auditLog.deleteMany({
      where: { organizationId: testOrgId },
    });
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.auditLog.deleteMany({
        where: { organizationId: testOrgId },
      });
    }
  });

  it("should sanitize sensitive data (passwords, tokens) before persistence", () => {
    const rawData = {
      password: "SuperSecretPassword123!",
      userToken: "Bearer secret_jwt_token_value",
      clientEmail: "test@client.co.ke",
      nestedConfig: {
        api_key: "key_xyz123",
        amount: 5000,
      },
    };

    const sanitized = sanitizeAuditData(rawData);

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.userToken).toBe("[REDACTED]");
    expect(sanitized.clientEmail).toBe("test@client.co.ke");
    expect(sanitized.nestedConfig.api_key).toBe("[REDACTED]");
    expect(sanitized.nestedConfig.amount).toBe(5000);
  });

  it("should create an audit log with structured forensic fields", async () => {
    const log = await recordAuditLog({
      organizationId: testOrgId,
      actorId: testAdminId,
      actorEmail: testAdminEmail,
      actorName: "Test Officer",
      actorRole: UserRole.ADMIN,
      action: "APPLICATION_STATUS_TRANSITION",
      actionCategory: "APPLICATION",
      description: "Application #APP-2026-001 moved to DOCUMENT_REVIEW",
      entityType: "Application",
      entityId: "app-id-999",
      entityReference: "APP-2026-001",
      previousValue: { status: "SUBMITTED" },
      newValue: { status: "DOCUMENT_REVIEW" },
      status: "SUCCESS",
      ipAddress: "197.232.4.15",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      metadata: { secretField: "myPassword123", note: "Verified statutory documents" },
    });

    expect(log).toBeDefined();
    expect(log.id).toBeDefined();
    expect(log.actionCategory).toBe("APPLICATION");
    expect(log.actorName).toBe("Test Officer");
    expect(log.entityReference).toBe("APP-2026-001");
    expect(log.status).toBe("SUCCESS");
    expect((log.metadata as any).secretField).toBe("[REDACTED]");
  });

  it("should query audit logs with multi-dimensional filtering & summary metrics", async () => {
    // Record another failed login event
    await recordAuditLog({
      organizationId: testOrgId,
      actorEmail: "unauthorized@swiftdoc.co.ke",
      actorRole: UserRole.ADMIN,
      action: "USER_LOGIN_FAILED",
      actionCategory: "AUTH",
      description: "Failed login attempt: Invalid password",
      entityType: "User",
      status: "FAILURE",
      ipAddress: "41.90.1.2",
    });

    const result = await auditService.listAuditLogs(testOrgId, {
      page: 1,
      limit: 10,
    });

    expect(result.items.length).toBe(2);
    expect(result.summaryMetrics).toBeDefined();
    expect(result.summaryMetrics?.totalEvents).toBe(2);
    expect(result.summaryMetrics?.successCount).toBe(1);
    expect(result.summaryMetrics?.failureCount).toBe(1);

    // Test Search filter
    const searchResult = await auditService.listAuditLogs(testOrgId, {
      page: 1,
      limit: 10,
      search: "APP-2026-001",
    });

    expect(searchResult.items.length).toBe(1);
    expect(searchResult.items[0].entityReference).toBe("APP-2026-001");

    // Test Category filter
    const authResult = await auditService.listAuditLogs(testOrgId, {
      page: 1,
      limit: 10,
      category: "AUTH",
    });

    expect(authResult.items.length).toBe(1);
    expect(authResult.items[0].action).toBe("USER_LOGIN_FAILED");
  });
});
