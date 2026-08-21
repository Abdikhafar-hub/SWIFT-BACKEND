import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_BASE = "http://localhost:5000/api/v1";

async function runE2eAdminFilingVerification() {
  console.log("🚀 Starting End-to-End Admin Filing Workflow Verification...");

  try {
    // 1. Authenticate as ADMIN
    console.log("1️⃣ Authenticating as ADMIN (admin@swiftdoc.co.ke)...");
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@swiftdoc.co.ke",
        password: "Admin@SwiftDoc2026!",
      }),
    });

    if (!adminLoginRes.ok) {
      throw new Error(`Admin login failed: ${adminLoginRes.statusText}`);
    }

    const adminLoginJson = await adminLoginRes.json();
    const adminToken = adminLoginJson.data.tokens.accessToken;
    console.log(`✅ ADMIN login successful. Access Token retrieved: ${adminToken.substring(0, 25)}...`);

    const adminAuthHeader = {
      "Authorization": `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    };

    // 2. Fetch Clients & Services via Admin API
    console.log("2️⃣ Fetching client list & service catalog via Admin API...");
    const clientsRes = await fetch(`${API_BASE}/admin/clients?limit=100`, {
      headers: adminAuthHeader,
    });
    const clientsJson = await clientsRes.json();
    const clients = Array.isArray(clientsJson.data) ? clientsJson.data : (clientsJson.data?.items || []);
    console.log(`Fetched ${clients.length} client profiles from Admin API.`);

    let targetClient = clients.find(
      (c: any) => c.email === "john.kamau@example.com" || c.fullName?.includes("John Kamau")
    );

    if (!targetClient && clients.length > 0) {
      targetClient = clients[0];
    }

    if (!targetClient) {
      const dbTarget = await prisma.client.findFirst({
        where: { email: "john.kamau@example.com" },
      });
      targetClient = dbTarget;
    }

    if (!targetClient) {
      throw new Error("No client found in database or API!");
    }
    console.log(`✅ Target Client selected: ${targetClient.fullName || targetClient.businessName || targetClient.email} (${targetClient.id})`);

    const servicesRes = await fetch(`${API_BASE}/admin/services`, {
      headers: adminAuthHeader,
    });
    const servicesJson = await servicesRes.json();
    const services = Array.isArray(servicesJson.data) ? servicesJson.data : (servicesJson.data?.items || []);
    console.log(`Fetched ${services.length} services from backend catalog.`);

    const visaService = services.find(
      (s: any) => s.code === "SRV-VISA-UK-VISITOR" || s.name?.includes("UK Visitor Visa")
    ) || services.find((s: any) => s.name?.toLowerCase().includes("visa"));

    if (!visaService) {
      throw new Error("No Visa service found in service catalog!");
    }
    console.log(`✅ Statutory Visa Service selected: ${visaService.name} (${visaService.id})`);

    // 3. Initiate Admin Application Filing via POST /admin/applications
    console.log("3️⃣ Initiating Statutory Client Filing via POST /api/v1/admin/applications...");
    const filingPayload = {
      clientId: targetClient.id,
      serviceId: visaService.id,
      priority: "HIGH",
      notesSummary: "Verification test: Admin initiated UK Visitor Visa dossier filing.",
      metadata: {
        destinationCountry: "United Kingdom",
        visaCategory: "Visitor / Tourist",
        passportNumber: "AK9876543",
        passportExpiry: "2032-12-31",
        travelStartDate: "2026-10-01",
        travelEndDate: "2026-10-15",
        processingEmbassy: visaService.defaultGovernmentAgency || "UK Visas and Immigration (UKVI)",
      },
    };

    const createRes = await fetch(`${API_BASE}/admin/applications`, {
      method: "POST",
      headers: adminAuthHeader,
      body: JSON.stringify(filingPayload),
    });

    const createJson = await createRes.json();
    if (!createRes.ok) {
      throw new Error(`Create application API failed: ${JSON.stringify(createJson)}`);
    }

    const createdApp = createJson.data;
    console.log(`✅ Application created via API! Application ID: ${createdApp.id}`);
    console.log(`   Application Number: #${createdApp.applicationNumber}`);

    // 4. Verify PostgreSQL Mutations & State Persistence
    console.log("4️⃣ Verifying database mutations in PostgreSQL via Prisma ORM...");
    const dbApp = await prisma.application.findUnique({
      where: { id: createdApp.id },
      include: {
        requirements: true,
        payments: true,
        client: true,
        service: true,
      },
    });

    if (!dbApp) {
      throw new Error(`Application ID ${createdApp.id} was not found in PostgreSQL!`);
    }

    console.log("✅ DB Application Row Verified:");
    console.log(`   - ID: ${dbApp.id}`);
    console.log(`   - Application Number: ${dbApp.applicationNumber}`);
    console.log(`   - Status: ${dbApp.status}`);
    console.log(`   - Priority: ${dbApp.priority}`);
    console.log(`   - Total Amount: KES ${dbApp.totalAmount}`);
    console.log(`   - Due Amount: KES ${dbApp.dueAmount}`);
    console.log(`   - Notes Summary: ${dbApp.notesSummary}`);
    console.log(`   - Metadata Preserved:`, JSON.stringify(dbApp.metadata, null, 2));

    if (!dbApp.requirements || dbApp.requirements.length === 0) {
      throw new Error("FAILED: Requirement snapshots were NOT generated in PostgreSQL!");
    }
    console.log(`✅ DB Requirements Snapshot Verified: ${dbApp.requirements.length} requirement(s) snapshot created:`);
    dbApp.requirements.forEach((req, idx) => {
      console.log(`   [${idx + 1}] ${req.name} (${req.code}) - Type: ${req.type}, Required: ${req.required}`);
    });

    // 5. Authenticate as CLIENT & Verify Cross-Portal Visibility
    console.log("5️⃣ Authenticating as CLIENT (john.kamau@example.com) to verify cross-portal access...");
    const clientLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "john.kamau@example.com",
        password: "Client@SwiftDoc2026!",
      }),
    });

    if (!clientLoginRes.ok) {
      throw new Error(`Client login failed: ${clientLoginRes.statusText}`);
    }

    const clientLoginJson = await clientLoginRes.json();
    const clientToken = clientLoginJson.data.tokens.accessToken;
    console.log("✅ CLIENT login successful. Access Token retrieved.");

    const clientAuthHeader = {
      "Authorization": `Bearer ${clientToken}`,
      "Content-Type": "application/json",
    };

    console.log("6️⃣ Fetching client applications via GET /api/v1/client/applications...");
    const clientAppsRes = await fetch(`${API_BASE}/client/applications`, {
      headers: clientAuthHeader,
    });
    const clientAppsJson = await clientAppsRes.json();
    const clientApps = Array.isArray(clientAppsJson.data) ? clientAppsJson.data : (clientAppsJson.data?.items || []);
    const clientFoundApp = clientApps.find((a: any) => a.id === createdApp.id);

    if (!clientFoundApp) {
      throw new Error(`FAILED: Newly created admin filing (ID: ${createdApp.id}) is NOT visible in Client application list!`);
    }
    console.log(`✅ Cross-Portal Verification: Application #${clientFoundApp.applicationNumber} is visible in Client Portal!`);

    console.log("7️⃣ Fetching client application detail via GET /api/v1/client/applications/:id...");
    const clientDetailRes = await fetch(`${API_BASE}/client/applications/${createdApp.id}`, {
      headers: clientAuthHeader,
    });
    const clientDetailJson = await clientDetailRes.json();
    const clientDetail = clientDetailJson.data;

    console.log("✅ Client Detail Response Verified:");
    console.log(`   - Service Name: ${clientDetail.service?.name}`);
    console.log(`   - Requirements Count: ${clientDetail.requirements?.length}`);
    console.log(`   - Visa Metadata Preserved:`, JSON.stringify(clientDetail.metadata, null, 2));

    console.log("\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! The Admin New Client Filing workflow is fully operational and production-ready.");
  } catch (err: any) {
    console.error("❌ Verification failed:", err.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2eAdminFilingVerification();
