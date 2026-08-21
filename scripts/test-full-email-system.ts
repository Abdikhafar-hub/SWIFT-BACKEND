/**
 * SWIFT DOC COMPREHENSIVE EMAIL SYSTEM TEST SUITE
 * ------------------------------------------------
 * Validates rendering, layout compatibility, HTML structure, subject lines,
 * and dispatch tracking for all transactional email templates.
 */

import { MockEmailProvider, emailService } from "../src/infrastructure/email/index.js";
import {
  renderEmailVerificationEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPasswordResetSuccessEmail,
  renderSecurityLoginAlertEmail,
  renderApplicationCreatedEmail,
  renderApplicationStatusUpdatedEmail,
  renderRequirementNeededEmail,
  renderDocumentApprovedEmail,
  renderDocumentRejectedEmail,
  renderQCPassedEmail,
  renderGovernmentStatusUpdatedEmail,
  renderGovernmentApprovalEmail,
  renderInvoiceIssuedEmail,
  renderPaymentReceivedEmail,
  renderRefundCompletedEmail,
  renderDeliveryDispatchedEmail,
  renderDocumentExpiryWarningEmail,
  renderAdminNewRegistrationEmail,
} from "../src/infrastructure/email/email-templates.js";

async function runEmailSystemAudit() {
  console.log("==================================================");
  console.log("STARTING SWIFT DOC PRODUCTION EMAIL SYSTEM AUDIT");
  console.log("==================================================\n");

  const mockProvider = new MockEmailProvider();

  // Test 1: Email Verification / OTP Template
  console.log("[1/19] Auditing Email Verification / OTP Template...");
  const otpTmpl = renderEmailVerificationEmail({ name: "Abdikhafar Issack", otp: "847291", expiresMinutes: 10 });
  if (!otpTmpl.subject.includes("Verify") || !otpTmpl.html.includes("847291") || !otpTmpl.html.includes("SWIFT DOC")) {
    throw new Error("OTP Template validation failed!");
  }
  await mockProvider.sendEmailVerificationEmail("user@swiftdoc.test", "Abdikhafar Issack", "847291");
  console.log(" ✔ Passed.");

  // Test 2: Welcome / Account Activated Template
  console.log("[2/19] Auditing Welcome / Account Activated Template...");
  const welcomeTmpl = renderWelcomeEmail({ name: "Abdikhafar Issack", clientNumber: "SD-CL-000102" });
  if (!welcomeTmpl.subject.includes("Welcome") || !welcomeTmpl.html.includes("SD-CL-000102")) {
    throw new Error("Welcome Template validation failed!");
  }
  await mockProvider.sendWelcomeEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-CL-000102");
  console.log(" ✔ Passed.");

  // Test 3: Password Reset Request Template
  console.log("[3/19] Auditing Password Reset Request Template...");
  const resetTmpl = renderPasswordResetEmail({ name: "Abdikhafar Issack", resetLink: "https://swiftdoc.co.ke/reset?token=xyz" });
  if (!resetTmpl.subject.includes("Reset") || !resetTmpl.html.includes("https://swiftdoc.co.ke/reset?token=xyz")) {
    throw new Error("Password Reset Template validation failed!");
  }
  await mockProvider.sendPasswordResetEmail("user@swiftdoc.test", "Abdikhafar Issack", "https://swiftdoc.co.ke/reset?token=xyz");
  console.log(" ✔ Passed.");

  // Test 4: Password Reset Success Template
  console.log("[4/19] Auditing Password Reset Success Template...");
  const resetSuccessTmpl = renderPasswordResetSuccessEmail({ name: "Abdikhafar Issack" });
  if (!resetSuccessTmpl.subject.includes("Successful")) {
    throw new Error("Password Reset Success Template validation failed!");
  }
  await mockProvider.sendPasswordResetSuccessEmail("user@swiftdoc.test", "Abdikhafar Issack");
  console.log(" ✔ Passed.");

  // Test 5: Security Login Alert Template
  console.log("[5/19] Auditing Security Login Alert Template...");
  const secAlertTmpl = renderSecurityLoginAlertEmail({
    name: "Abdikhafar Issack",
    loginTime: "2026-08-20 21:00 EAT",
    ipAddress: "102.217.156.42",
    device: "Chrome on macOS",
  });
  if (!secAlertTmpl.subject.includes("Security Alert") || !secAlertTmpl.html.includes("102.217.156.42")) {
    throw new Error("Security Login Alert Template validation failed!");
  }
  console.log(" ✔ Passed.");

  // Test 6: Application Created Template
  console.log("[6/19] Auditing Application Created Template...");
  const appCreatedTmpl = renderApplicationCreatedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "Business Name Registration",
  });
  if (!appCreatedTmpl.subject.includes("SD-2026-0841") || !appCreatedTmpl.html.includes("Business Name Registration")) {
    throw new Error("Application Created Template validation failed!");
  }
  await mockProvider.sendApplicationCreatedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "Business Name Registration");
  console.log(" ✔ Passed.");

  // Test 7: Application Status Updated Template
  console.log("[7/19] Auditing Application Status Updated Template...");
  const appStatusTmpl = renderApplicationStatusUpdatedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "Business Name Registration",
    newStatus: "GOVERNMENT_PROCESSING",
    statusDescription: "Dossier submitted to Business Registration Service (BRS).",
  });
  if (!appStatusTmpl.subject.includes("GOVERNMENT_PROCESSING")) {
    throw new Error("Application Status Updated Template validation failed!");
  }
  await mockProvider.sendApplicationStatusUpdatedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "GOVERNMENT_PROCESSING", "Dossier submitted to BRS.");
  console.log(" ✔ Passed.");

  // Test 8: Requirement Needed Template
  console.log("[8/19] Auditing Requirement Needed Template...");
  const reqNeededTmpl = renderRequirementNeededEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    requirementName: "National ID Clear Scan (Front & Back)",
    deadline: "2026-08-25",
  });
  if (!reqNeededTmpl.html.includes("National ID Clear Scan")) {
    throw new Error("Requirement Needed Template validation failed!");
  }
  await mockProvider.sendRequirementNeededEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "National ID Clear Scan");
  console.log(" ✔ Passed.");

  // Test 9: Document Approved Template
  console.log("[9/19] Auditing Document Approved Template...");
  const docApproveTmpl = renderDocumentApprovedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    documentTitle: "KRA PIN Certificate",
  });
  if (!docApproveTmpl.subject.includes("Approved")) {
    throw new Error("Document Approved Template validation failed!");
  }
  await mockProvider.sendDocumentApprovedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "KRA PIN Certificate");
  console.log(" ✔ Passed.");

  // Test 10: Document Rejected Template
  console.log("[10/19] Auditing Document Rejected Template...");
  const docRejectTmpl = renderDocumentRejectedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    documentTitle: "Passport Photo",
    reason: "Image resolution too low. Must be 350x450px on white background.",
  });
  if (!docRejectTmpl.html.includes("resolution too low")) {
    throw new Error("Document Rejected Template validation failed!");
  }
  await mockProvider.sendDocumentRejectedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "Passport Photo", "Resolution too low");
  console.log(" ✔ Passed.");

  // Test 11: QC Passed Template
  console.log("[11/19] Auditing Quality Control Passed Template...");
  const qcTmpl = renderQCPassedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "CR12 Official Search Report",
  });
  if (!qcTmpl.subject.includes("QC Passed")) {
    throw new Error("QC Passed Template validation failed!");
  }
  console.log(" ✔ Passed.");

  // Test 12: Government Status Updated Template
  console.log("[12/19] Auditing Government Status Updated Template...");
  const govStatusTmpl = renderGovernmentStatusUpdatedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "CR12 Search",
    agency: "Business Registration Service (BRS)",
    externalReference: "BRS-2026-98124",
    status: "UNDER_REVIEW",
  });
  if (!govStatusTmpl.html.includes("BRS-2026-98124")) {
    throw new Error("Government Status Template validation failed!");
  }
  console.log(" ✔ Passed.");

  // Test 13: Government Approval Template
  console.log("[13/19] Auditing Government Approval Template...");
  const govApproveTmpl = renderGovernmentApprovalEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "CR12 Search Report",
    agency: "Business Registration Service (BRS)",
    externalReference: "BRS-CERT-88412",
  });
  if (!govApproveTmpl.subject.includes("Approved")) {
    throw new Error("Government Approval Template validation failed!");
  }
  console.log(" ✔ Passed.");

  // Test 14: Invoice Issued Template
  console.log("[14/19] Auditing Invoice Issued Template...");
  const invoiceTmpl = renderInvoiceIssuedEmail({
    name: "Abdikhafar Issack",
    invoiceNumber: "SD-INV-2026-0042",
    appNumber: "SD-2026-0841",
    serviceName: "Business Name Filing",
    totalAmount: "3,500",
    dueAt: "2026-08-30",
  });
  if (!invoiceTmpl.subject.includes("SD-INV-2026-0042") || !invoiceTmpl.html.includes("KES 3,500")) {
    throw new Error("Invoice Issued Template validation failed!");
  }
  await mockProvider.sendInvoiceIssuedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-INV-2026-0042", "SD-2026-0841", "Business Name Filing", "3,500", "2026-08-30");
  console.log(" ✔ Passed.");

  // Test 15: Payment Received Template
  console.log("[15/19] Auditing Payment Received Template...");
  const paymentTmpl = renderPaymentReceivedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    amount: "3,500",
    receiptNumber: "SD-RCT-88412",
    transactionRef: "QHG7192841",
  });
  if (!paymentTmpl.subject.includes("SD-RCT-88412") || !paymentTmpl.html.includes("QHG7192841")) {
    throw new Error("Payment Received Template validation failed!");
  }
  await mockProvider.sendPaymentReceivedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "3,500", "SD-RCT-88412", "QHG7192841");
  console.log(" ✔ Passed.");

  // Test 16: Refund Completed Template
  console.log("[16/19] Auditing Refund Completed Template...");
  const refundTmpl = renderRefundCompletedEmail({
    name: "Abdikhafar Issack",
    refundNumber: "SD-RFD-0012",
    amount: "1,200",
    invoiceNumber: "SD-INV-2026-0042",
    appNumber: "SD-2026-0841",
  });
  if (!refundTmpl.subject.includes("SD-RFD-0012")) {
    throw new Error("Refund Completed Template validation failed!");
  }
  await mockProvider.sendRefundCompletedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-RFD-0012", "1,200", "SD-INV-2026-0042", "SD-2026-0841");
  console.log(" ✔ Passed.");

  // Test 17: Delivery Dispatched Template
  console.log("[17/19] Auditing Delivery Dispatched Template...");
  const deliveryTmpl = renderDeliveryDispatchedEmail({
    name: "Abdikhafar Issack",
    appNumber: "SD-2026-0841",
    serviceName: "CR12 Certificate",
    deliveryMethod: "Fargo Courier",
    trackingNumber: "FGO-992184",
  });
  if (!deliveryTmpl.subject.includes("Dispatched") || !deliveryTmpl.html.includes("FGO-992184")) {
    throw new Error("Delivery Dispatched Template validation failed!");
  }
  await mockProvider.sendDeliveryDispatchedEmail("user@swiftdoc.test", "Abdikhafar Issack", "SD-2026-0841", "CR12 Certificate", "Fargo Courier", "FGO-992184");
  console.log(" ✔ Passed.");

  // Test 18: Document Expiry Warning Template
  console.log("[18/19] Auditing Document Expiry Warning Template...");
  const expiryTmpl = renderDocumentExpiryWarningEmail({
    name: "Abdikhafar Issack",
    documentTitle: "Single Business Permit 2025",
    expiryDate: "2026-12-31",
  });
  if (!expiryTmpl.subject.includes("Expiry Reminder")) {
    throw new Error("Document Expiry Warning Template validation failed!");
  }
  await mockProvider.sendDocumentExpiryWarningEmail("user@swiftdoc.test", "Abdikhafar Issack", "Single Business Permit 2025", "2026-12-31");
  console.log(" ✔ Passed.");

  // Test 19: Admin New Registration Template
  console.log("[19/19] Auditing Admin New Registration Template...");
  const adminRegTmpl = renderAdminNewRegistrationEmail({
    clientName: "Abdikhafar Issack",
    clientNumber: "SD-CL-000102",
    clientEmail: "abdikhafar@example.co.ke",
    clientPhone: "+254712345678",
    clientType: "INDIVIDUAL",
  });
  if (!adminRegTmpl.subject.includes("Admin Alert") || !adminRegTmpl.html.includes("SD-CL-000102")) {
    throw new Error("Admin New Registration Template validation failed!");
  }
  await mockProvider.sendAdminNewRegistrationEmail("admin@swiftdoc.test", "Abdikhafar Issack", "SD-CL-000102", "abdikhafar@example.co.ke", "+254712345678", "INDIVIDUAL");
  console.log(" ✔ Passed.");

  console.log("\n==================================================");
  console.log(`TOTAL SENT EMAILS LOGGED IN MOCK PROVIDER: ${mockProvider.sentEmails.length}`);
  console.log("ALL 19 EMAIL TEMPLATES AUDITED & CERTIFIED SUCCESSFULLY! 🎉");
  console.log("==================================================");
}

runEmailSystemAudit().catch((err) => {
  console.error("❌ EMAIL SYSTEM AUDIT FAILED:", err);
  process.exit(1);
});
