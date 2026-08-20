import { PrismaClient, UserRole, ClientType, CommunicationChannel, RequirementType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. Create Organization
  const organization = await prisma.organization.upsert({
    where: { slug: "swift-doc" },
    update: {},
    create: {
      name: "Swift Doc",
      slug: "swift-doc",
      email: "info@swiftdoc.co.ke",
      phone: "+254 729 732 142",
      address: "Unga House, Muthithi Road - Westlands, Nairobi, Kenya",
      currency: "KES",
    },
  });

  console.log(`✅ Organization created: ${organization.name} (${organization.id})`);

  // 2. Create Default Admin User
  const adminPasswordHash = await bcrypt.hash("Admin@SwiftDoc2026!", 12);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@swiftdoc.co.ke" },
    update: {},
    create: {
      organizationId: organization.id,
      email: "admin@swiftdoc.co.ke",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      emailEnabled: true,
      smsEnabled: true,
      inAppEnabled: true,
      marketingEnabled: false,
    },
  });
  console.log(`✅ Admin User created: ${adminUser.email}`);

  // 3. Create Sample Client User & Profile
  const clientPasswordHash = await bcrypt.hash("Client@SwiftDoc2026!", 12);
  const clientUser = await prisma.user.upsert({
    where: { email: "john.kamau@example.com" },
    update: {},
    create: {
      organizationId: organization.id,
      email: "john.kamau@example.com",
      passwordHash: clientPasswordHash,
      role: UserRole.CLIENT,
      isActive: true,
      isEmailVerified: true,
    },
  });

  await prisma.notificationPreference.upsert({
    where: { userId: clientUser.id },
    update: {},
    create: {
      userId: clientUser.id,
      emailEnabled: true,
      smsEnabled: true,
      inAppEnabled: true,
      marketingEnabled: false,
    },
  });

  const clientProfile = await prisma.client.upsert({
    where: { clientNumber: "SD-CL-000001" },
    update: {
      userId: clientUser.id,
      organizationId: organization.id,
    },
    create: {
      organizationId: organization.id,
      userId: clientUser.id,
      clientNumber: "SD-CL-000001",
      clientType: ClientType.INDIVIDUAL,
      fullName: "John Kamau Kariuki",
      email: "john.kamau@example.com",
      phone: "+254712345678",
      nationality: "Kenyan",
      nationalId: "28491023",
      kraPin: "A009182736P",
      county: "Nairobi",
      city: "Nairobi",
      address: "Kilimani, Argwings Kodhek Rd",
      preferredCommunicationChannel: CommunicationChannel.EMAIL,
      isActive: true,
    },
  });
  console.log(`✅ Client Profile created: ${clientProfile.fullName} (${clientProfile.clientNumber})`);

  // 4. Seed Service Categories & Real Kenyan Services
  const catalogData = [
    {
      code: "CAT-BR",
      slug: "business-registration",
      name: "Business Registration",
      description: "Incorporation, business names, CR12 and annual returns with BRS on eCitizen.",
      icon: "building-2",
      displayOrder: 1,
      services: [
        {
          code: "SRV-BR-001",
          slug: "company-incorporation",
          name: "Private Limited Company Registration",
          description: "Full limited company incorporation with CR12, memorandum, articles, and KRA PIN.",
          estimatedDuration: "3–7 working days",
          slaHours: 72,
          governmentFee: 10650.0,
          serviceFee: 5500.0,
          displayOrder: 1,
          defaultGovernmentAgency: "BRS",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-NAMES", name: "Three Proposed Company Names", type: RequirementType.TEXT, required: true, description: "Preferred names in order of priority." },
            { code: "REQ-DIRECTOR-ID", name: "Director National ID / Passport Scans", type: RequirementType.DOCUMENT, required: true, description: "Clear copies of ID or passport for each director." },
            { code: "REQ-DIRECTOR-PIN", name: "Director KRA PIN Certificates", type: RequirementType.DOCUMENT, required: true, description: "Valid KRA PIN for all Kenyan directors." },
            { code: "REQ-DIRECTOR-PHOTO", name: "Director Passport Photos", type: RequirementType.DOCUMENT, required: true, description: "Recent passport-size photo on a white background." },
            { code: "REQ-OFFICE-ADDRESS", name: "Registered Physical Office Details", type: RequirementType.TEXT, required: true, description: "Building name, floor, road/street, plot number, postal code." },
            { code: "REQ-SHAREHOLDING", name: "Shareholding Distribution", type: RequirementType.TEXT, required: true, description: "Number of shares per shareholder and share capital breakdown." },
          ],
        },
        {
          code: "SRV-BR-002",
          slug: "business-name-registration",
          name: "Business Name (Sole Proprietorship / Partnership) Registration",
          description: "Trading name reservation and registration certificate (BN2).",
          estimatedDuration: "1–3 working days",
          slaHours: 48,
          governmentFee: 1000.0,
          serviceFee: 2500.0,
          displayOrder: 2,
          defaultGovernmentAgency: "BRS",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-BN-NAMES", name: "Proposed Business Names", type: RequirementType.TEXT, required: true, description: "Three trading name options." },
            { code: "REQ-PROPRIETOR-ID", name: "Proprietor ID / Passport", type: RequirementType.DOCUMENT, required: true, description: "Clear copy of National ID or Passport." },
            { code: "REQ-PROPRIETOR-PIN", name: "Proprietor KRA PIN", type: RequirementType.DOCUMENT, required: true, description: "KRA PIN Certificate." },
            { code: "REQ-PROPRIETOR-PHOTO", name: "Passport Photo", type: RequirementType.DOCUMENT, required: true, description: "Recent passport photograph." },
          ],
        },
        {
          code: "SRV-BR-003",
          slug: "cr12-processing",
          name: "Official CR12 Search & Certification",
          description: "Official confirmation of directors, shareholders, and registered office from BRS for banks and tenders.",
          estimatedDuration: "1–3 working days",
          slaHours: 24,
          governmentFee: 650.0,
          serviceFee: 1500.0,
          displayOrder: 3,
          defaultGovernmentAgency: "BRS",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 12,
          requirements: [
            { code: "REQ-COMPANY-NAME", name: "Company Name & Registration Number", type: RequirementType.TEXT, required: true, description: "Full legal company name and CPR number." },
            { code: "REQ-DIRECTOR-CONSENT", name: "Director Authorization / ID", type: RequirementType.DOCUMENT, required: true, description: "Director ID copy requesting the CR12 search." },
          ],
        },
      ],
    },
    {
      code: "CAT-KRA",
      slug: "kra-tax-services",
      name: "KRA & Tax Services",
      description: "PIN registration, VAT, Tax Compliance Certificates (TCC) and returns on iTax.",
      icon: "receipt",
      displayOrder: 2,
      services: [
        {
          code: "SRV-KRA-001",
          slug: "tax-compliance-certificate",
          name: "Tax Compliance Certificate (TCC)",
          description: "Full ledger audit, return reconciliation, and TCC clearance certificate generation.",
          estimatedDuration: "1–5 working days",
          slaHours: 48,
          governmentFee: 0.0,
          serviceFee: 3000.0,
          displayOrder: 1,
          defaultGovernmentAgency: "KRA",
          defaultGovernmentPlatform: "iTax",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 12,
          requirements: [
            { code: "REQ-KRA-PIN", name: "KRA PIN & iTax Credentials", type: RequirementType.TEXT, required: true, description: "PIN number and iTax login password (or email access)." },
            { code: "REQ-NATIONAL-ID", name: "National ID Copy", type: RequirementType.DOCUMENT, required: true, description: "Individual ID or Director ID." },
          ],
        },
        {
          code: "SRV-KRA-002",
          slug: "kra-pin-registration",
          name: "KRA PIN Registration & Recovery",
          description: "New individual/company PIN registration, email changes, and password recovery.",
          estimatedDuration: "Same day",
          slaHours: 12,
          governmentFee: 0.0,
          serviceFee: 1500.0,
          displayOrder: 2,
          defaultGovernmentAgency: "KRA",
          defaultGovernmentPlatform: "iTax",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: false,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-ID-DOCUMENT", name: "National ID / Certificate of Incorporation", type: RequirementType.DOCUMENT, required: true, description: "Copy of ID for individuals or Certificate for companies." },
            { code: "REQ-CONTACT-DETAILS", name: "Active Email & Phone Number", type: RequirementType.TEXT, required: true, description: "Email and phone to link to KRA records." },
          ],
        },
      ],
    },
    {
      code: "CAT-IMM",
      slug: "passport-immigration",
      name: "Passport & Immigration",
      description: "Passports, Kenya eTA, work permits, permanent residency and visas with Nyayo House.",
      icon: "passport",
      displayOrder: 3,
      services: [
        {
          code: "SRV-IMM-001",
          slug: "passport-application-tracking",
          name: "Passport Application & Tracking",
          description: "First-issue 34/50/66 page passport application, appointment booking, and biometrics preparation.",
          estimatedDuration: "10–21 working days",
          slaHours: 96,
          governmentFee: 7550.0,
          serviceFee: 4000.0,
          displayOrder: 1,
          defaultGovernmentAgency: "Immigration",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 120,
          requirements: [
            { code: "REQ-BIRTH-CERT", name: "Original Birth Certificate", type: RequirementType.DOCUMENT, required: true, description: "Clear scan of birth certificate." },
            { code: "REQ-ID-SCAN", name: "National ID Card (Both sides)", type: RequirementType.DOCUMENT, required: true, description: "Clear scan of national ID." },
            { code: "REQ-RECOMMENDER-ID", name: "Recommender ID & PIN Copy", type: RequirementType.DOCUMENT, required: true, description: "Copy of Kenyan recommender ID." },
            { code: "REQ-PARENTS-ID", name: "Parents ID / Death Certificate", type: RequirementType.DOCUMENT, required: false, description: "Parents identification documents." },
          ],
        },
        {
          code: "SRV-IMM-002",
          slug: "kenya-eta",
          name: "Kenya Electronic Travel Authorisation (eTA)",
          description: "Official entry authorisation for international travellers visiting Kenya.",
          estimatedDuration: "Same day – 3 days",
          slaHours: 24,
          governmentFee: 4500.0,
          serviceFee: 2500.0,
          displayOrder: 2,
          defaultGovernmentAgency: "Immigration",
          defaultGovernmentPlatform: "eTA Portal",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 3,
          requirements: [
            { code: "REQ-PASSPORT-BIO", name: "Passport Bio-Data Page", type: RequirementType.DOCUMENT, required: true, description: "Passport valid for at least 6 months." },
            { code: "REQ-PASSPORT-PHOTO", name: "Passport Photo / Selfie", type: RequirementType.DOCUMENT, required: true, description: "Recent photo on plain background." },
            { code: "REQ-FLIGHT-ITINERARY", name: "Flight Itinerary & Accommodation Booking", type: RequirementType.DOCUMENT, required: true, description: "Flight details and hotel/host address." },
          ],
        },
      ],
    },
    {
      code: "CAT-CIVIL",
      slug: "civil-registration",
      name: "Civil Registration",
      description: "Birth, death, marriage certificates, Deed Poll and record corrections.",
      icon: "file-text",
      displayOrder: 4,
      services: [
        {
          code: "SRV-CIV-001",
          slug: "birth-certificate-application",
          name: "Birth Certificate Application & Replacement",
          description: "New birth certificate processing or replacement of lost/damaged certificates.",
          estimatedDuration: "7–21 working days",
          slaHours: 96,
          governmentFee: 200.0,
          serviceFee: 2500.0,
          displayOrder: 1,
          defaultGovernmentAgency: "Civil Registration",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-BIRTH-NOTIFICATION", name: "Birth Notification or Hospital Record", type: RequirementType.DOCUMENT, required: true, description: "Original birth notification from hospital/chief." },
            { code: "REQ-PARENTS-DOCS", name: "Parents National IDs and Birth Certificates", type: RequirementType.DOCUMENT, required: true, description: "Copies of mother and father identification." },
          ],
        },
      ],
    },
    {
      code: "CAT-NTSA",
      slug: "ntsa-motor-vehicle",
      name: "NTSA & Motor Vehicle",
      description: "Driving licences, TIMS onboarding, logbook transfers and vehicle searches.",
      icon: "car",
      displayOrder: 5,
      services: [
        {
          code: "SRV-NTSA-001",
          slug: "smart-driving-licence",
          name: "Smart Driving Licence Application & Renewal",
          description: "Smart DL biometrics scheduling, renewal, and endorsements on TIMS.",
          estimatedDuration: "7–21 working days",
          slaHours: 72,
          governmentFee: 3050.0,
          serviceFee: 2000.0,
          displayOrder: 1,
          defaultGovernmentAgency: "NTSA",
          defaultGovernmentPlatform: "TIMS",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 36,
          requirements: [
            { code: "REQ-ID-KRA", name: "National ID and KRA PIN", type: RequirementType.DOCUMENT, required: true, description: "Valid ID and PIN." },
            { code: "REQ-OLD-DL", name: "Old DL / Driving School Interim", type: RequirementType.DOCUMENT, required: true, description: "Copy of current driving licence or school test pass." },
          ],
        },
        {
          code: "SRV-NTSA-002",
          slug: "logbook-transfer",
          name: "Logbook Transfer Coordination",
          description: "Buyer and seller TIMS account coordination through to new logbook issuance.",
          estimatedDuration: "3–14 working days",
          slaHours: 72,
          governmentFee: 2600.0,
          serviceFee: 3500.0,
          displayOrder: 2,
          defaultGovernmentAgency: "NTSA",
          defaultGovernmentPlatform: "TIMS",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-LOGBOOK", name: "Original Logbook Scan", type: RequirementType.DOCUMENT, required: true, description: "Clear copy of vehicle logbook." },
            { code: "REQ-SALE-AGREEMENT", name: "Signed Sale Agreement", type: RequirementType.DOCUMENT, required: true, description: "Sale agreement signed by buyer and seller." },
            { code: "REQ-BUYER-SELLER-IDS", name: "Buyer and Seller IDs & PINs", type: RequirementType.DOCUMENT, required: true, description: "Copies of National IDs and KRA PINs." },
          ],
        },
      ],
    },
    {
      code: "CAT-CLEAR",
      slug: "clearance-vetting",
      name: "Clearance & Vetting",
      description: "Police clearance certificates (Good Conduct), HELB, and SHA compliance.",
      icon: "shield-check",
      displayOrder: 6,
      services: [
        {
          code: "SRV-CLR-001",
          slug: "police-clearance-good-conduct",
          name: "Police Clearance Certificate (Good Conduct)",
          description: "DCI fingerprint appointment booking, tracking, and certificate download on eCitizen.",
          estimatedDuration: "10–21 working days",
          slaHours: 96,
          governmentFee: 1050.0,
          serviceFee: 2000.0,
          displayOrder: 1,
          defaultGovernmentAgency: "DCI",
          defaultGovernmentPlatform: "eCitizen",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: 12,
          requirements: [
            { code: "REQ-ID-CARD", name: "National ID Card Scan", type: RequirementType.DOCUMENT, required: true, description: "Clear copy of both sides of National ID." },
            { code: "REQ-LOCATION-PREF", name: "Preferred Fingerprint Station", type: RequirementType.TEXT, required: true, description: "e.g. DCI Headquarters, Nyayo House, or County CID." },
          ],
        },
      ],
    },
    {
      code: "CAT-AUTH",
      slug: "authentication-legalisation",
      name: "Authentication & Legalisation",
      description: "Ministry of Foreign Affairs authentication, embassy legalisation, and notarisation.",
      icon: "stamp",
      displayOrder: 7,
      services: [
        {
          code: "SRV-AUTH-001",
          slug: "document-authentication",
          name: "Ministry of Foreign Affairs Document Authentication",
          description: "Official government authentication of Kenyan academic, corporate, and civil certificates for international use.",
          estimatedDuration: "5–14 working days",
          slaHours: 72,
          governmentFee: 1000.0,
          serviceFee: 4000.0,
          displayOrder: 1,
          defaultGovernmentAgency: "MFA",
          defaultGovernmentPlatform: "Ministry Portal",
          requiresFullPaymentBeforeSubmission: true,
          requiresGovernmentTrackingNumber: true,
          requiresFinalDocument: true,
          pauseSlaOnGovernmentProcessing: false,
          pauseSlaOnClientAction: true,
          expiryValidityMonths: null,
          requirements: [
            { code: "REQ-ORIGINAL-DOC", name: "Original Document Scan", type: RequirementType.DOCUMENT, required: true, description: "Certificate, transcript, or legal deed to be authenticated." },
            { code: "REQ-DEST-COUNTRY", name: "Destination Country & Purpose", type: RequirementType.TEXT, required: true, description: "Target country and intended use (e.g. employment, visa, study)." },
          ],
        },
      ],
    },
  ];

  for (const catData of catalogData) {
    const { services, ...categoryFields } = catData;
    const category = await prisma.serviceCategory.upsert({
      where: { code: categoryFields.code },
      update: {
        name: categoryFields.name,
        description: categoryFields.description,
        icon: categoryFields.icon,
        displayOrder: categoryFields.displayOrder,
      },
      create: {
        organizationId: organization.id,
        ...categoryFields,
      },
    });

    console.log(`📂 Service Category: ${category.name} (${category.code})`);

    for (const srvData of services) {
      const { requirements, ...serviceFields } = srvData;
      const service = await prisma.service.upsert({
        where: { code: serviceFields.code },
        update: {
          name: serviceFields.name,
          description: serviceFields.description,
          estimatedDuration: serviceFields.estimatedDuration,
          slaHours: serviceFields.slaHours,
          governmentFee: serviceFields.governmentFee,
          serviceFee: serviceFields.serviceFee,
          displayOrder: serviceFields.displayOrder,
        },
        create: {
          organizationId: organization.id,
          categoryId: category.id,
          ...serviceFields,
        },
      });

      console.log(`  ⚙️ Service: ${service.name} (${service.code})`);

      for (let i = 0; i < requirements.length; i++) {
        const req = requirements[i];
        await prisma.serviceRequirement.upsert({
          where: {
            serviceId_code: {
              serviceId: service.id,
              code: req.code,
            },
          },
          update: {
            name: req.name,
            description: req.description,
            type: req.type,
            required: req.required,
            displayOrder: i + 1,
          },
          create: {
            serviceId: service.id,
            code: req.code,
            name: req.name,
            description: req.description,
            type: req.type,
            required: req.required,
            displayOrder: i + 1,
          },
        });
      }
    }
  }

  // 5. Seed sample application and comprehensive financial records
  const cr12Service = await prisma.service.findFirst({
    where: { code: "SRV-BR-003" },
  });
  const incorporationService = await prisma.service.findFirst({
    where: { code: "SRV-BR-001" },
  });
  const etaService = await prisma.service.findFirst({
    where: { code: "SRV-IMM-002" },
  });

  if (cr12Service && clientProfile) {
    // 5.1 Fully Paid Application & Invoice
    const app1 = await prisma.application.upsert({
      where: { applicationNumber: "SD-APP-2026-000001" },
      update: {},
      create: {
        organizationId: organization.id,
        clientId: clientProfile.id,
        serviceId: cr12Service.id,
        applicationNumber: "SD-APP-2026-000001",
        serviceName: cr12Service.name,
        categoryName: "Business & Company Registration",
        status: "PROCESSING",
        priority: "MEDIUM",
        totalAmount: 2150.0,
        paidAmount: 2150.0,
        dueAmount: 0.0,
      },
    });

    const inv1 = await prisma.payment.upsert({
      where: { invoiceNumber: "SD-INV-2026-000001" },
      update: {},
      create: {
        organizationId: organization.id,
        clientId: clientProfile.id,
        applicationId: app1.id,
        invoiceNumber: "SD-INV-2026-000001",
        currency: "KES",
        subtotal: 2150.0,
        governmentFee: 650.0,
        serviceFee: 1500.0,
        otherFee: 0.0,
        discount: 0.0,
        tax: 0.0,
        totalAmount: 2150.0,
        amountPaid: 2150.0,
        amountDue: 0.0,
        status: "PAID",
        issuedAt: new Date(),
        paidAt: new Date(),
        dueAt: new Date(Date.now() + 7 * 86400000),
        lineItems: {
          create: [
            {
              organizationId: organization.id,
              description: "Official CR12 Search & Certification - Government Statutory Fee",
              category: "GOVERNMENT_FEE",
              quantity: 1,
              unitAmount: 650.0,
              totalAmount: 650.0,
              isGovernmentFee: true,
              isTaxable: false,
            },
            {
              organizationId: organization.id,
              description: "Official CR12 Search & Certification - Swift Doc Facilitation Fee",
              category: "SERVICE_FEE",
              quantity: 1,
              unitAmount: 1500.0,
              totalAmount: 1500.0,
              isGovernmentFee: false,
              isTaxable: false,
            },
          ],
        },
      },
    });

    const tx1 = await prisma.paymentTransaction.upsert({
      where: { transactionNumber: "SD-TX-2026-000001" },
      update: {},
      create: {
        organizationId: organization.id,
        paymentId: inv1.id,
        clientId: clientProfile.id,
        applicationId: app1.id,
        transactionNumber: "SD-TX-2026-000001",
        transactionType: "PAYMENT",
        paymentMethod: "MPESA",
        amount: 2150.0,
        currency: "KES",
        status: "COMPLETED",
        idempotencyKey: "SEED_TX_000001",
        externalReference: "QKH76XZ12A",
        paidAt: new Date(),
      },
    });

    await prisma.paymentAllocation.upsert({
      where: { id: "seed-allocation-01" },
      update: {},
      create: {
        id: "seed-allocation-01",
        organizationId: organization.id,
        transactionId: tx1.id,
        paymentId: inv1.id,
        amount: 2150.0,
        allocatedAt: new Date(),
      },
    });

    await prisma.receipt.upsert({
      where: { receiptNumber: "SD-REC-2026-000001" },
      update: {},
      create: {
        organizationId: organization.id,
        clientId: clientProfile.id,
        applicationId: app1.id,
        paymentId: inv1.id,
        transactionId: tx1.id,
        receiptNumber: "SD-REC-2026-000001",
        amount: 2150.0,
        currency: "KES",
        paymentMethod: "MPESA",
        transactionReference: "QKH76XZ12A",
        payerName: clientProfile.fullName,
        amountPaid: 2150.0,
        remainingBalance: 0.0,
        issuedAt: new Date(),
      },
    });

    // Seed Reconciliation entry for Tx 1
    await prisma.reconciliationRecord.upsert({
      where: { id: "seed-recon-01" },
      update: {},
      create: {
        id: "seed-recon-01",
        organizationId: organization.id,
        transactionId: tx1.id,
        reference: "QKH76XZ12A",
        amount: 2150.0,
        currency: "KES",
        provider: "MPESA",
        status: "MATCHED",
        reconciledAt: new Date(),
        notes: "Auto-reconciled with Daraja M-Pesa statement",
      },
    });

    // 5.2 Issued (Pending Payment) Application & Invoice
    if (incorporationService) {
      const app2 = await prisma.application.upsert({
        where: { applicationNumber: "SD-APP-2026-000002" },
        update: {},
        create: {
          organizationId: organization.id,
          clientId: clientProfile.id,
          serviceId: incorporationService.id,
          applicationNumber: "SD-APP-2026-000002",
          serviceName: incorporationService.name,
          categoryName: "Business & Company Registration",
          status: "PAYMENT_PENDING",
          priority: "HIGH",
          totalAmount: 16150.0,
          paidAmount: 0.0,
          dueAmount: 16150.0,
        },
      });

      await prisma.payment.upsert({
        where: { invoiceNumber: "SD-INV-2026-000002" },
        update: {},
        create: {
          organizationId: organization.id,
          clientId: clientProfile.id,
          applicationId: app2.id,
          invoiceNumber: "SD-INV-2026-000002",
          currency: "KES",
          subtotal: 16150.0,
          governmentFee: 10650.0,
          serviceFee: 5500.0,
          otherFee: 0.0,
          discount: 0.0,
          tax: 0.0,
          totalAmount: 16150.0,
          amountPaid: 0.0,
          amountDue: 16150.0,
          status: "ISSUED",
          issuedAt: new Date(),
          dueAt: new Date(Date.now() + 5 * 86400000),
          lineItems: {
            create: [
              {
                organizationId: organization.id,
                description: "Private Limited Company Incorporation - BRS Statutory Fee",
                category: "GOVERNMENT_FEE",
                quantity: 1,
                unitAmount: 10650.0,
                totalAmount: 10650.0,
                isGovernmentFee: true,
                isTaxable: false,
              },
              {
                organizationId: organization.id,
                description: "Private Limited Company Incorporation - Professional Legal & Advisory Fee",
                category: "SERVICE_FEE",
                quantity: 1,
                unitAmount: 5500.0,
                totalAmount: 5500.0,
                isGovernmentFee: false,
                isTaxable: false,
              },
            ],
          },
        },
      });
    }

    // 5.3 Partially Paid Application with Bank Payment
    if (etaService) {
      const app3 = await prisma.application.upsert({
        where: { applicationNumber: "SD-APP-2026-000003" },
        update: {},
        create: {
          organizationId: organization.id,
          clientId: clientProfile.id,
          serviceId: etaService.id,
          applicationNumber: "SD-APP-2026-000003",
          serviceName: etaService.name,
          categoryName: "Passport & Immigration",
          status: "PROCESSING",
          priority: "URGENT",
          totalAmount: 7000.0,
          paidAmount: 4500.0,
          dueAmount: 2500.0,
        },
      });

      const inv3 = await prisma.payment.upsert({
        where: { invoiceNumber: "SD-INV-2026-000003" },
        update: {},
        create: {
          organizationId: organization.id,
          clientId: clientProfile.id,
          applicationId: app3.id,
          invoiceNumber: "SD-INV-2026-000003",
          currency: "KES",
          subtotal: 7000.0,
          governmentFee: 4500.0,
          serviceFee: 2500.0,
          otherFee: 0.0,
          discount: 0.0,
          tax: 0.0,
          totalAmount: 7000.0,
          amountPaid: 4500.0,
          amountDue: 2500.0,
          status: "PARTIALLY_PAID",
          issuedAt: new Date(),
          paidAt: new Date(),
          dueAt: new Date(Date.now() + 3 * 86400000),
          lineItems: {
            create: [
              {
                organizationId: organization.id,
                description: "Kenya Electronic Travel Authorisation (eTA) - Government Visa Fee",
                category: "GOVERNMENT_FEE",
                quantity: 1,
                unitAmount: 4500.0,
                totalAmount: 4500.0,
                isGovernmentFee: true,
                isTaxable: false,
              },
              {
                organizationId: organization.id,
                description: "Kenya Electronic Travel Authorisation (eTA) - Priority Processing Fee",
                category: "SERVICE_FEE",
                quantity: 1,
                unitAmount: 2500.0,
                totalAmount: 2500.0,
                isGovernmentFee: false,
                isTaxable: false,
              },
            ],
          },
        },
      });

      const tx3 = await prisma.paymentTransaction.upsert({
        where: { transactionNumber: "SD-TX-2026-000002" },
        update: {},
        create: {
          organizationId: organization.id,
          paymentId: inv3.id,
          clientId: clientProfile.id,
          applicationId: app3.id,
          transactionNumber: "SD-TX-2026-000002",
          transactionType: "PAYMENT",
          paymentMethod: "BANK_TRANSFER",
          amount: 4500.0,
          currency: "KES",
          status: "COMPLETED",
          idempotencyKey: "SEED_TX_000002",
          externalReference: "FT2611099238",
          paidAt: new Date(),
        },
      });

      await prisma.receipt.upsert({
        where: { receiptNumber: "SD-REC-2026-000002" },
        update: {},
        create: {
          organizationId: organization.id,
          clientId: clientProfile.id,
          applicationId: app3.id,
          paymentId: inv3.id,
          transactionId: tx3.id,
          receiptNumber: "SD-REC-2026-000002",
          amount: 4500.0,
          currency: "KES",
          paymentMethod: "BANK_TRANSFER",
          transactionReference: "FT2611099238",
          payerName: clientProfile.fullName,
          amountPaid: 4500.0,
          remainingBalance: 2500.0,
          issuedAt: new Date(),
        },
      });
    }

    // 5.4 Overdue Invoice
    await prisma.payment.upsert({
      where: { invoiceNumber: "SD-INV-2026-000004" },
      update: {},
      create: {
        organizationId: organization.id,
        clientId: clientProfile.id,
        invoiceNumber: "SD-INV-2026-000004",
        currency: "KES",
        subtotal: 5000.0,
        governmentFee: 0.0,
        serviceFee: 5000.0,
        otherFee: 0.0,
        discount: 0.0,
        tax: 0.0,
        totalAmount: 5000.0,
        amountPaid: 0.0,
        amountDue: 5000.0,
        status: "OVERDUE",
        issuedAt: new Date(Date.now() - 30 * 86400000),
        dueAt: new Date(Date.now() - 15 * 86400000),
        lineItems: {
          create: [
            {
              organizationId: organization.id,
              description: "Corporate Compliance Review & Statutory Health Check",
              category: "SERVICE_FEE",
              quantity: 1,
              unitAmount: 5000.0,
              totalAmount: 5000.0,
              isGovernmentFee: false,
              isTaxable: false,
            },
          ],
        },
      },
    });

    // 5.5 Unmatched External Statement
    await prisma.reconciliationRecord.upsert({
      where: { id: "seed-recon-02" },
      update: {},
      create: {
        id: "seed-recon-02",
        organizationId: organization.id,
        reference: "QKH99ZZ99X",
        amount: 8500.0,
        currency: "KES",
        provider: "MPESA",
        status: "UNMATCHED",
        notes: "Unmatched M-Pesa C2B settlement awaiting client reference attribution",
      },
    });

    console.log(`💳 Seeded Phase 4 Financial Ledger: Multi-state Invoices, Transactions, Receipts, and Reconciliation records.`);
  }

  console.log("✨ Database seed completed successfully!");
}
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
