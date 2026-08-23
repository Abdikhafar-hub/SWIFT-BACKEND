import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../infrastructure/database/prisma.js";
import { applicationMessageService } from "../modules/messages/messages.service.js";
import { UserRole, NoteVisibility, NotificationChannel } from "@prisma/client";

describe("Admin ↔ Client Communications Multi-Channel E2E Certification", () => {
  let orgId: string;
  let clientUserId: string;
  let clientId: string;
  let adminUserId: string;
  let applicationId: string;

  beforeAll(async () => {
    // 1. Get or create test organization
    const org = await prisma.organization.findFirst();
    if (!org) throw new Error("No organization found for testing");
    orgId = org.id;

    // 2. Get client user and profile
    const client = await prisma.client.findFirst({
      where: { organizationId: orgId },
      include: { user: true, applications: true },
    });
    if (!client || !client.applications[0]) throw new Error("No client profile with applications found for testing");
    
    clientId = client.id;
    clientUserId = client.userId || "";
    applicationId = client.applications[0].id;

    // 3. Get admin user
    const admin = await prisma.user.findFirst({
      where: { organizationId: orgId, role: UserRole.ADMIN },
    });
    if (!admin) throw new Error("No admin user found for testing");
    adminUserId = admin.id;
  });

  it("1. Admin dispatches message to client application", async () => {
    const messageRecord = await applicationMessageService.sendMessage({
      applicationId,
      organizationId: orgId,
      senderId: adminUserId,
      senderRole: UserRole.ADMIN,
      subject: "Official Direct Compliance Notice - Statutory Document Review",
      message: "Please resubmit your statutory CR12 document for verification.",
      channel: NotificationChannel.IN_APP,
      sendEmail: true,
      sendSms: true,
      visibility: NoteVisibility.CLIENT_VISIBLE,
    });

    expect(messageRecord).toBeDefined();
    expect(messageRecord.applicationId).toBe(applicationId);
    expect(messageRecord.senderRole).toBe(UserRole.ADMIN);
    expect(messageRecord.subject).toContain("Official Direct Compliance Notice");

    // Check that notification was created for client
    const notification = await prisma.notification.findFirst({
      where: {
        userId: clientUserId,
        applicationId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).toBeDefined();
    expect(notification?.title).toContain("Officer Dispatch");
  });

  it("2. Client fetches threads and sees Admin dispatch in Officer Messages Hub", async () => {
    const clientThreads = await applicationMessageService.getThreads({
      organizationId: orgId,
      actorRole: UserRole.CLIENT,
      clientId,
      folder: "inbox",
    });

    expect(clientThreads).toBeDefined();
    const targetThread = clientThreads.find((t) => t.applicationId === applicationId);
    expect(targetThread).toBeDefined();
    expect(targetThread?.subject).toContain("Official Direct Compliance Notice");
    expect(targetThread?.lastSenderRole).toBe(UserRole.ADMIN);
  });

  it("3. Client responds to Admin dispatch", async () => {
    const replyRecord = await applicationMessageService.sendMessage({
      applicationId,
      organizationId: orgId,
      senderId: clientUserId,
      senderRole: UserRole.CLIENT,
      clientId,
      subject: "Re: Official Direct Compliance Notice - Statutory Document Review",
      message: "I have uploaded the requested CR12 certificate to the Document Vault.",
      channel: NotificationChannel.IN_APP,
      sendEmail: true,
      visibility: NoteVisibility.CLIENT_VISIBLE,
    });

    expect(replyRecord).toBeDefined();
    expect(replyRecord.senderRole).toBe(UserRole.CLIENT);
  });

  it("4. Admin fetches threads and sees Client reply", async () => {
    const adminThreads = await applicationMessageService.getThreads({
      organizationId: orgId,
      actorRole: UserRole.ADMIN,
      folder: "inbox",
    });

    expect(adminThreads).toBeDefined();
    const targetThread = adminThreads.find((t) => t.applicationId === applicationId);
    expect(targetThread).toBeDefined();
    expect(targetThread?.lastMessageSnippet).toContain("uploaded the requested CR12");
    expect(targetThread?.lastSenderRole).toBe(UserRole.CLIENT);
  });
});
