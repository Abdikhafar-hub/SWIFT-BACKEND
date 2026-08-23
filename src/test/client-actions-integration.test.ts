import { PrismaClient, UserRole, ApplicationStatus, ClientActionStatus, SlaEventType } from "@prisma/client";
import { clientActionsService } from "../modules/client-actions/client-actions.service.js";

const prisma = new PrismaClient();

async function runE2EIntegrationTest() {
  console.log("\n=======================================================");
  console.log("   SWIFT DOC: CLIENT ACTION E2E INTEGRATION AUDIT");
  console.log("=======================================================\n");

  try {
    // 1. Locate test context (Organization, Clients, Users, Application)
    const org = await prisma.organization.findFirst();
    if (!org) throw new Error("No organization found in database.");

    const adminUser = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN, organizationId: org.id },
    });
    if (!adminUser) throw new Error("No admin user found in database.");

    const clientUsers = await prisma.user.findMany({
      where: { role: UserRole.CLIENT, organizationId: org.id },
      include: { clientProfile: true },
      take: 2,
    });

    if (clientUsers.length < 1 || !clientUsers[0].clientProfile) {
      throw new Error("No client user with profile found in database.");
    }

    const clientUserA = clientUsers[0];
    const clientProfileA = clientUserA.clientProfile!;

    // Find or create test application for Client A
    let application = await prisma.application.findFirst({
      where: { clientId: clientProfileA.id, organizationId: org.id, deletedAt: null },
    });

    if (!application) {
      const service = await prisma.service.findFirst({ where: { organizationId: org.id } });
      if (!service) throw new Error("No service found to create test application.");

      application = await prisma.application.create({
        data: {
          organizationId: org.id,
          clientId: clientProfileA.id,
          serviceId: service.id,
          applicationNumber: `E2E-TEST-${Date.now()}`,
          status: ApplicationStatus.DOCUMENT_REVIEW,
          priority: "NORMAL",
          assignedAdminId: adminUser.id,
        },
      });
      console.log(`[SETUP] Created test application: #${application.applicationNumber}`);
    } else {
      console.log(`[SETUP] Using existing application: #${application.applicationNumber}`);
    }

    // Clean up any prior test actions for this application
    await prisma.clientAction.deleteMany({
      where: { applicationId: application.id },
    });

    // Ensure application is in active processing status (DOCUMENT_REVIEW)
    application = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.DOCUMENT_REVIEW,
        pausedAt: null,
        assignedAdminId: adminUser.id,
      },
    });

    console.log(`[SETUP] Prepared active application with clean actions state: #${application.applicationNumber} (Status: DOCUMENT_REVIEW)`);



    console.log(`[SETUP] Prepared active application: #${application.applicationNumber} (Status: DOCUMENT_REVIEW)`);

    console.log("\n--- TEST PHASE 1: ADMIN DISPATCH & PERSISTENCE ---");

    const testTitle = `E2E Test Directive: Upload KRA PIN (${Date.now()})`;
    const testDesc = "Verification audit requirement: Please upload your valid KRA PIN Certificate.";

    const createdAction = await clientActionsService.createAction(
      application.id,
      org.id,
      adminUser.id,
      adminUser.email,
      {
        type: "UPLOAD_DOCUMENT",
        title: testTitle,
        description: testDesc,
        priority: "HIGH",
        dueAt: new Date(Date.now() + 86400000),
      }
    );

    console.log(`[✓] Action Created. Action ID: ${createdAction.id}`);
    console.log(`[✓] Initial DB Status: ${createdAction.status}`);

    // Verify DB record
    const dbAction1 = await prisma.clientAction.findUnique({ where: { id: createdAction.id } });
    if (!dbAction1 || dbAction1.status !== ClientActionStatus.OPEN) {
      throw new Error(`DB Assertion Failed: Action status is not OPEN (${dbAction1?.status})`);
    }

    // Verify Application Status & SLA Pause
    const dbApp1 = await prisma.application.findUnique({ where: { id: application.id } });
    console.log(`[✓] Application Status: ${dbApp1?.status}`);
    console.log(`[✓] Application Paused At: ${dbApp1?.pausedAt ? dbApp1.pausedAt.toISOString() : "NULL"}`);
    if (dbApp1?.status !== ApplicationStatus.ADDITIONAL_INFORMATION_REQUIRED || !dbApp1?.pausedAt) {
      throw new Error("DB Assertion Failed: Application SLA was not paused upon action creation!");
    }

    // Verify Client Notification
    const appWithClient = await prisma.application.findUnique({
      where: { id: application.id },
      include: { client: true },
    });

    const clientNotification = await prisma.notification.findFirst({
      where: {
        userId: appWithClient?.client?.userId || undefined,
        title: { contains: "Action Required" },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`[✓] Client Notification Persisted: ${clientNotification ? "YES" : "NO"} (${clientNotification?.id || ""})`);
    if (!clientNotification) {
      throw new Error("Notification Assertion Failed: In-app notification was not dispatched to client.");
    }


    console.log("\n--- TEST PHASE 2: CROSS-TENANT SECURITY ISOLATION ---");
    if (clientUsers.length >= 2 && clientUsers[1].clientProfile) {
      const clientProfileB = clientUsers[1].clientProfile;
      console.log(`[SECURITY] Testing unauthorized access from Client B (${clientProfileB.id})...`);
      
      let unauthorizedReadBlocked = false;
      try {
        await clientActionsService.getActionById(createdAction.id, org.id, UserRole.CLIENT, clientProfileB.id);
      } catch (err: any) {
        unauthorizedReadBlocked = true;
        console.log(`[✓] Cross-client read correctly blocked (403 Forbidden): "${err.message}"`);
      }
      if (!unauthorizedReadBlocked) {
        throw new Error("SECURITY FAILURE: Client B was able to read Client A's action!");
      }

      let unauthorizedResolveBlocked = false;
      try {
        await clientActionsService.completeAction(
          createdAction.id,
          org.id,
          clientUsers[1].id,
          UserRole.CLIENT,
          clientUsers[1].email,
          { completionNotes: "Malicious resolve attempt" }
        );
      } catch (err: any) {
        unauthorizedResolveBlocked = true;
        console.log(`[✓] Cross-client resolution correctly blocked (403 Forbidden): "${err.message}"`);
      }
      if (!unauthorizedResolveBlocked) {
        throw new Error("SECURITY FAILURE: Client B was able to complete Client A's action!");
      }
    } else {
      console.log("[SECURITY] Skipping multi-client check (only 1 client present in DB). Single tenant checks verified.");
    }

    console.log("\n--- TEST PHASE 3: CLIENT RESOLUTION & SLA RESUMPTION ---");
    const completionResult = await clientActionsService.completeAction(
      createdAction.id,
      org.id,
      clientUserA.id,
      UserRole.CLIENT,
      clientUserA.email,
      {
        completionNotes: "KRA Certificate uploaded and verified against statutory database.",
        responsePayload: { documentId: "e2e-kra-doc-99" },
      }
    );

    console.log(`[✓] Action Completed. Remaining Open Count: ${completionResult.remainingOpenCount}`);
    console.log(`[✓] Application SLA Resumed: ${completionResult.applicationResumed}`);

    // Verify DB record post-resolution
    const dbAction2 = await prisma.clientAction.findUnique({ where: { id: createdAction.id } });
    console.log(`[✓] Final DB Action Status: ${dbAction2?.status}`);
    console.log(`[✓] Completed At: ${dbAction2?.completedAt?.toISOString()}`);
    console.log(`[✓] Completion Notes: "${dbAction2?.completionNotes}"`);
    if (dbAction2?.status !== ClientActionStatus.COMPLETED || !dbAction2?.completedAt) {
      throw new Error("DB Assertion Failed: Action status did not update to COMPLETED!");
    }

    // Verify Application SLA Resumption
    const dbApp2 = await prisma.application.findUnique({ where: { id: application.id } });
    console.log(`[✓] Final Application Status: ${dbApp2?.status}`);
    console.log(`[✓] Final Application Paused At: ${dbApp2?.pausedAt ? dbApp2.pausedAt.toISOString() : "NULL (RESUMED)"}`);
    if (dbApp2?.pausedAt !== null) {
      throw new Error("DB Assertion Failed: Application pausedAt timestamp was not cleared upon resolution!");
    }

    // Verify SLA Events
    const slaEvents = await prisma.applicationSlaEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    console.log(`[✓] Latest SLA Event: ${slaEvents[0]?.eventType} (${slaEvents[0]?.reason})`);
    if (slaEvents[0]?.eventType !== SlaEventType.RESUMED) {
      throw new Error("SLA Event Assertion Failed: RESUMED event not recorded.");
    }

    console.log("\n--- TEST PHASE 4: ADMIN QUEUE REFLECTION ---");
    const adminQueue = await clientActionsService.getAllActionsForAdmin(org.id, {
      status: ClientActionStatus.COMPLETED,
      search: testTitle,
    });

    console.log(`[✓] Admin Action Queue found matching item: ${adminQueue.items.length > 0 ? "YES" : "NO"}`);
    if (adminQueue.items.length === 0) {
      throw new Error("Admin Queue Assertion Failed: Completed action not found in admin list.");
    }

    console.log("\n=======================================================");
    console.log("   ALL E2E INTEGRATION AUDIT TESTS PASSED SUCCESSFULLY! 🚀");
    console.log("=======================================================\n");

  } catch (error) {
    console.error("\n❌ E2E INTEGRATION AUDIT FAILED:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2EIntegrationTest();
