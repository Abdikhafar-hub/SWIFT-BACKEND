/**
 * SWIFT DOC PRODUCTION TRANSACTIONAL EMAIL TEMPLATES
 * ---------------------------------------------------
 * Highly polished, gold-accented HTML templates for all platform lifecycle events.
 */

import {
  renderEmailLayout,
  renderEmailOtpBadge,
  renderEmailDetailsTable,
  DetailRow,
} from "./email-builder.js";
import { env } from "../../config/env.js";

const DEFAULT_PORTAL_URL = env.APP_URL || "http://localhost:3000";

// ============================================================================
// 1. AUTHENTICATION & SECURITY TEMPLATES
// ============================================================================

export function renderEmailVerificationEmail(params: { name: string; otp: string; expiresMinutes?: number }) {
  const title = "Verify Your Email Address";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Hello ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Thank you for initiating registration with Swift Doc. To secure your account and verify ownership of your email address, please enter the 6-digit verification code below:
    </p>
    ${renderEmailOtpBadge(params.otp, params.expiresMinutes || 10)}
    <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
      Once verified, you will be guided to complete your statutory profile setup to activate your filing portal.
    </p>
  `;
  return {
    subject: "Verify your Swift Doc account",
    html: renderEmailLayout({
      title,
      previewText: `Your Swift Doc verification code is ${params.otp}`,
      badge: { text: "Security Verification", color: "gold" },
      bodyHtml,
      securityNotice: "Never share your verification OTP with anyone. Swift Doc officers will never ask for your verification code.",
    }),
  };
}

export function renderWelcomeEmail(params: { name: string; clientNumber?: string; portalUrl?: string }) {
  const title = "Welcome to Swift Doc - Account Activated";
  const rows: DetailRow[] = [
    { label: "Account Holder", value: params.name },
    { label: "Client Number", value: params.clientNumber || "Assigned", isBold: true, highlightColor: "#c59b27" },
    { label: "Account Status", value: "Active & Verified", isBold: true, highlightColor: "#059669" },
    { label: "Portal Access", value: "Full Access Enabled" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 20px; margin-top: 0; font-weight: 800;">Welcome to Swift Doc, ${params.name}!</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your account verification and statutory client dossier setup have been successfully completed. You now have full access to Kenya's premiere document processing and consular filing platform.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      You can now initiate statutory business filings, order official certificate search reports, lodge visa applications, and track real-time delivery statuses from your dashboard.
    </p>
  `;
  return {
    subject: `Welcome to Swift Doc, ${params.name}`,
    html: renderEmailLayout({
      title,
      previewText: "Your Swift Doc account has been activated.",
      badge: { text: "Account Activated", color: "green" },
      bodyHtml,
      cta: { text: "Go to Client Dashboard", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/dashboard`, color: "gold" },
    }),
  };
}

export function renderPasswordResetEmail(params: { name: string; resetLink: string; expiresMinutes?: number }) {
  const title = "Password Reset Request";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Hello ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      We received a request to reset the password associated with your Swift Doc account. Click the button below to establish a new password:
    </p>
  `;
  return {
    subject: "Reset your Swift Doc password",
    html: renderEmailLayout({
      title,
      previewText: "Password reset request for your Swift Doc account.",
      badge: { text: "Account Security", color: "amber" },
      bodyHtml,
      cta: { text: "Reset Password Now", href: params.resetLink, color: "gold" },
      securityNotice: `This single-use link expires in ${params.expiresMinutes || 60} minutes. If you did not request a password reset, your account remains secure and no action is needed.`,
    }),
  };
}

export function renderPasswordResetSuccessEmail(params: { name: string; portalUrl?: string }) {
  const title = "Password Reset Confirmation";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Hello ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      This email confirms that the password for your Swift Doc account was updated successfully. You can now sign in using your new credentials.
    </p>
  `;
  return {
    subject: "Password Reset Successful - Swift Doc",
    html: renderEmailLayout({
      title,
      previewText: "Your Swift Doc password has been updated.",
      badge: { text: "Security Notice", color: "blue" },
      bodyHtml,
      cta: { text: "Log In to Account", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/login`, color: "navy" },
      securityNotice: "If you did not perform this password change, please contact our security team immediately at compliance@swiftdoc.co.ke.",
    }),
  };
}

export function renderEmailChangeOtpEmail(params: { name: string; newEmail: string; otp: string; expiresMinutes?: number }) {
  const title = "Confirm Email Address Change";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Hello ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      You requested to update your primary Swift Doc administrative email address to <strong>${params.newEmail}</strong>. Enter the 6-digit verification OTP code below to confirm this change:
    </p>
    ${renderEmailOtpBadge(params.otp, params.expiresMinutes || 10)}
    <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
      If you did not request an email address change, please contact Swift Doc security operations immediately.
    </p>
  `;
  return {
    subject: "Security OTP: Verify Your New Email Address - Swift Doc",
    html: renderEmailLayout({
      title,
      previewText: `Your email verification OTP code is ${params.otp}`,
      badge: { text: "Email Change Verification", color: "gold" },
      bodyHtml,
      securityNotice: "Never share your security verification OTP with anyone.",
    }),
  };
}

export function renderAdminPasswordChangedEmail(params: { name: string }) {
  const title = "Admin Password Changed";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Hello ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      This security alert confirms that your Swift Doc Admin Portal password was successfully changed.
    </p>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      If you performed this action, no further steps are required. All subsequent logins will require your new password.
    </p>
  `;
  return {
    subject: "Security Notification: Password Changed - Swift Doc Admin",
    html: renderEmailLayout({
      title,
      previewText: "Your Swift Doc admin password was updated.",
      badge: { text: "Security Alert", color: "amber" },
      bodyHtml,
      securityNotice: "If you did NOT authorize this password change, contact Swift Doc SOC immediately to prevent unauthorized access.",
    }),
  };
}

export function renderSecurityLoginAlertEmail(params: { name: string; loginTime: string; ipAddress: string; device?: string }) {
  const title = "New Account Sign-in Alert";
  const rows: DetailRow[] = [
    { label: "Account User", value: params.name },
    { label: "Sign-in Time", value: params.loginTime, isBold: true },
    { label: "IP Address", value: params.ipAddress },
    { label: "Device / Browser", value: params.device || "Unknown Browser" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Security Notification</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      We detected a new sign-in to your Swift Doc account. Details of the session are listed below:
    </p>
    ${renderEmailDetailsTable(rows)}
  `;
  return {
    subject: "Security Alert: New Sign-in to Swift Doc Account",
    html: renderEmailLayout({
      title,
      previewText: "New sign-in detected on your account.",
      badge: { text: "Security Alert", color: "amber" },
      bodyHtml,
      securityNotice: "If this was you, no action is required. If you do not recognize this activity, please reset your password immediately.",
    }),
  };
}

// ============================================================================
// 2. APPLICATION & REQUIREMENT WORKFLOW TEMPLATES
// ============================================================================

export function renderApplicationCreatedEmail(params: { name: string; appNumber: string; serviceName: string; portalUrl?: string }) {
  const title = "Application Lodged Successfully";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true, highlightColor: "#c59b27" },
    { label: "Statutory Service", value: params.serviceName, isBold: true },
    { label: "Initial Status", value: "Verification In Progress", highlightColor: "#0284c7" },
    { label: "Submitted Date", value: new Date().toLocaleDateString("en-KE", { dateStyle: "long" }) },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your application for <strong>${params.serviceName}</strong> has been lodged and initialized in our operations system.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Our document compliance specialists are reviewing your submitted information against official registry standards. You will be notified immediately if additional items are required.
    </p>
  `;
  return {
    subject: `Application Lodged: ${params.appNumber} - ${params.serviceName}`,
    html: renderEmailLayout({
      title,
      previewText: `Application ${params.appNumber} for ${params.serviceName} has been received.`,
      badge: { text: "Filing Initialized", color: "gold" },
      bodyHtml,
      cta: { text: "View Application Progress", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/applications/${params.appNumber}`, color: "gold" },
    }),
  };
}

export function renderApplicationStatusUpdatedEmail(params: {
  name: string;
  appNumber: string;
  serviceName: string;
  newStatus: string;
  statusDescription?: string;
  portalUrl?: string;
}) {
  const title = "Application Status Update";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true },
    { label: "Service", value: params.serviceName },
    { label: "New Status", value: params.newStatus, isBold: true, highlightColor: "#0284c7" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      The status of your application <strong>${params.appNumber}</strong> (${params.serviceName}) has been updated.
    </p>
    ${renderEmailDetailsTable(rows)}
    ${params.statusDescription ? `<p style="color: #475569; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${params.statusDescription}</p>` : ""}
  `;
  return {
    subject: `Status Update: ${params.appNumber} is now ${params.newStatus}`,
    html: renderEmailLayout({
      title,
      previewText: `Application ${params.appNumber} updated to ${params.newStatus}.`,
      badge: { text: "Status Transition", color: "blue" },
      bodyHtml,
      cta: { text: "Track Progress on Portal", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/applications/${params.appNumber}`, color: "gold" },
    }),
  };
}

export function renderRequirementNeededEmail(params: {
  name: string;
  appNumber: string;
  serviceName?: string;
  requirementName: string;
  deadline?: string;
  portalUrl?: string;
}) {
  const title = "Action Required: Outstanding Requirement";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true },
    { label: "Required Document", value: params.requirementName, isBold: true, highlightColor: "#92400e" },
    { label: "Submission Target", value: params.deadline || "Promptly" },
  ];

  const bodyHtml = `
    <h2 style="color: #92400e; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      To complete the statutory processing of application <strong>${params.appNumber}</strong>, an additional document or credential is required.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Please log in to your portal and upload the requested item to avoid delays with government registry submission.
    </p>
  `;
  return {
    subject: `Action Required: Outstanding Requirement for ${params.appNumber}`,
    html: renderEmailLayout({
      title,
      previewText: `Action required on application ${params.appNumber}: Upload ${params.requirementName}`,
      badge: { text: "Action Required", color: "amber" },
      bodyHtml,
      cta: { text: "Upload Requirement Now", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/applications/${params.appNumber}`, color: "gold" },
    }),
  };
}

export function renderDocumentApprovedEmail(params: { name: string; appNumber: string; documentTitle: string }) {
  const title = "Document Verified & Approved";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your document <strong>"${params.documentTitle}"</strong> submitted for application <strong>${params.appNumber}</strong> has passed compliance review and has been marked as <strong>Approved</strong>.
    </p>
  `;
  return {
    subject: `Document Approved: ${params.documentTitle} (${params.appNumber})`,
    html: renderEmailLayout({
      title,
      previewText: `Document "${params.documentTitle}" approved for ${params.appNumber}.`,
      badge: { text: "Document Approved", color: "green" },
      bodyHtml,
    }),
  };
}

export function renderDocumentRejectedEmail(params: { name: string; appNumber: string; documentTitle: string; reason: string; portalUrl?: string }) {
  const title = "Document Correction Required";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true },
    { label: "Document Name", value: params.documentTitle, isBold: true },
    { label: "Rejection Reason", value: params.reason, highlightColor: "#991b1b" },
  ];

  const bodyHtml = `
    <h2 style="color: #991b1b; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your document <strong>"${params.documentTitle}"</strong> for application <strong>${params.appNumber}</strong> could not be approved as submitted.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Please review the rejection reason and upload a clear, corrected version on your client portal.
    </p>
  `;
  return {
    subject: `Document Resubmission Required: ${params.documentTitle} (${params.appNumber})`,
    html: renderEmailLayout({
      title,
      previewText: `Resubmission needed for ${params.documentTitle} (${params.appNumber}).`,
      badge: { text: "Correction Needed", color: "red" },
      bodyHtml,
      cta: { text: "Re-upload Document", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/applications/${params.appNumber}`, color: "gold" },
    }),
  };
}

export function renderQCPassedEmail(params: { name: string; appNumber: string; serviceName: string }) {
  const title = "Quality Control Passed";
  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Excellent news! Your application dossier for <strong>${params.serviceName} (${params.appNumber})</strong> has passed final Quality Control audit and has been approved for government submission.
    </p>
  `;
  return {
    subject: `QC Passed: Dossier Ready for Filing (${params.appNumber})`,
    html: renderEmailLayout({
      title,
      previewText: `Application ${params.appNumber} passed Quality Control.`,
      badge: { text: "QC Approved", color: "green" },
      bodyHtml,
    }),
  };
}

// ============================================================================
// 3. GOVERNMENT PROCESSING TEMPLATES
// ============================================================================

export function renderGovernmentStatusUpdatedEmail(params: {
  name: string;
  appNumber: string;
  serviceName: string;
  agency: string;
  externalReference?: string;
  status: string;
  statusDescription?: string;
}) {
  const title = "Government Agency Processing Update";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true },
    { label: "Government Agency", value: params.agency, isBold: true },
    { label: "Gov Tracking Ref", value: params.externalReference || "Pending Allotment" },
    { label: "Official Status", value: params.status, isBold: true, highlightColor: "#0284c7" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      We have received an official processing update from <strong>${params.agency}</strong> regarding application <strong>${params.appNumber}</strong> (${params.serviceName}).
    </p>
    ${renderEmailDetailsTable(rows)}
    ${params.statusDescription ? `<p style="color: #475569; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${params.statusDescription}</p>` : ""}
  `;
  return {
    subject: `Government Update: ${params.agency} - ${params.appNumber}`,
    html: renderEmailLayout({
      title,
      previewText: `Government update from ${params.agency} for ${params.appNumber}: ${params.status}`,
      badge: { text: "Government Status", color: "blue" },
      bodyHtml,
    }),
  };
}

export function renderGovernmentApprovalEmail(params: { name: string; appNumber: string; serviceName: string; agency: string; externalReference?: string }) {
  const title = "Government Approval Granted!";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true, highlightColor: "#c59b27" },
    { label: "Service", value: params.serviceName },
    { label: "Issuing Agency", value: params.agency, isBold: true },
    { label: "Gov Certificate Ref", value: params.externalReference || "Official Deliverable Issued" },
  ];

  const bodyHtml = `
    <h2 style="color: #065f46; font-size: 20px; margin-top: 0; font-weight: 800;">Filing Complete & Approved!</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Dear <strong>${params.name}</strong>, we are pleased to inform you that <strong>${params.agency}</strong> has officially granted approval for application <strong>${params.appNumber}</strong> (${params.serviceName}).
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your final official certificate and statutory documentation are now ready for digital download and physical dispatch.
    </p>
  `;
  return {
    subject: `Application Completed & Approved: ${params.appNumber}`,
    html: renderEmailLayout({
      title,
      previewText: `Great news! Application ${params.appNumber} has been approved by ${params.agency}.`,
      badge: { text: "Filing Approved", color: "green" },
      bodyHtml,
      cta: { text: "Download Documents", href: `${DEFAULT_PORTAL_URL}/applications/${params.appNumber}`, color: "gold" },
    }),
  };
}

// ============================================================================
// 4. FINANCIAL & PAYMENT TEMPLATES
// ============================================================================

export function renderInvoiceIssuedEmail(params: {
  name: string;
  invoiceNumber: string;
  appNumber: string;
  serviceName: string;
  totalAmount: string;
  dueAt?: string | null;
  paymentUrl?: string;
}) {
  const title = "Statutory Invoice Issued";
  const rows: DetailRow[] = [
    { label: "Invoice Number", value: params.invoiceNumber, isBold: true, highlightColor: "#0f172a" },
    { label: "Application Ref", value: params.appNumber },
    { label: "Statutory Service", value: params.serviceName },
    { label: "Total Payable", value: `KES ${params.totalAmount}`, isBold: true, highlightColor: "#c59b27" },
    { label: "Due Date", value: params.dueAt ? new Date(params.dueAt).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "Upon Receipt" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      An official invoice has been issued for application <strong>${params.appNumber}</strong> (${params.serviceName}).
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Please settle this invoice via M-PESA or Card to allow government disbursement fees to be remitted without interruption.
    </p>
  `;
  return {
    subject: `Invoice Issued: ${params.invoiceNumber} (KES ${params.totalAmount})`,
    html: renderEmailLayout({
      title,
      previewText: `Invoice ${params.invoiceNumber} issued for KES ${params.totalAmount}.`,
      badge: { text: "Invoice Issued", color: "gold" },
      bodyHtml,
      cta: { text: "Pay Invoice Online", href: params.paymentUrl || `${DEFAULT_PORTAL_URL}/payments/pay/${params.invoiceNumber}`, color: "gold" },
    }),
  };
}

export function renderPaymentReceivedEmail(params: {
  name: string;
  appNumber: string;
  serviceName?: string;
  amount: string;
  receiptNumber: string;
  transactionRef?: string;
  invoiceNumber?: string;
}) {
  const title = "Payment Receipt Confirmation";
  const rows: DetailRow[] = [
    { label: "Receipt Number", value: params.receiptNumber, isBold: true, highlightColor: "#059669" },
    { label: "Amount Paid", value: `KES ${params.amount}`, isBold: true, highlightColor: "#059669" },
    { label: "Application Ref", value: params.appNumber },
    { label: "Transaction Ref", value: params.transactionRef || "Confirmed" },
    { label: "Payment Date", value: new Date().toLocaleDateString("en-KE", { dateStyle: "medium" }) },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Thank you! We have received your payment of <strong>KES ${params.amount}</strong> for application <strong>${params.appNumber}</strong>.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Your payment has been reconciled and the official filing fees have been remitted for processing.
    </p>
  `;
  return {
    subject: `Payment Receipt: ${params.receiptNumber} (${params.appNumber})`,
    html: renderEmailLayout({
      title,
      previewText: `Payment of KES ${params.amount} confirmed for ${params.appNumber}. Receipt: ${params.receiptNumber}`,
      badge: { text: "Payment Confirmed", color: "green" },
      bodyHtml,
    }),
  };
}

export function renderRefundCompletedEmail(params: { name: string; refundNumber: string; amount: string; invoiceNumber?: string; appNumber?: string }) {
  const title = "Refund Processed";
  const rows: DetailRow[] = [
    { label: "Refund Ref", value: params.refundNumber, isBold: true, highlightColor: "#0284c7" },
    { label: "Refund Amount", value: `KES ${params.amount}`, isBold: true },
    { label: "Invoice Ref", value: params.invoiceNumber || "N/A" },
    { label: "Application Ref", value: params.appNumber || "N/A" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      A refund of <strong>KES ${params.amount}</strong> (Reference: <strong>${params.refundNumber}</strong>) has been successfully processed back to your original payment method.
    </p>
    ${renderEmailDetailsTable(rows)}
  `;
  return {
    subject: `Refund Processed: ${params.refundNumber} (KES ${params.amount})`,
    html: renderEmailLayout({
      title,
      previewText: `Refund of KES ${params.amount} processed for reference ${params.refundNumber}.`,
      badge: { text: "Refund Completed", color: "blue" },
      bodyHtml,
    }),
  };
}

// ============================================================================
// 5. DELIVERY & LOGISTICS TEMPLATES
// ============================================================================

export function renderDeliveryDispatchedEmail(params: {
  name: string;
  appNumber: string;
  serviceName: string;
  deliveryMethod: string;
  trackingNumber?: string;
  portalUrl?: string;
}) {
  const title = "Document Dispatched for Delivery";
  const rows: DetailRow[] = [
    { label: "Application Ref", value: params.appNumber, isBold: true },
    { label: "Service", value: params.serviceName },
    { label: "Courier Method", value: params.deliveryMethod, isBold: true },
    { label: "Tracking Reference", value: params.trackingNumber || "Assigned", highlightColor: "#16a34a" },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Great news! Your physical statutory deliverables for <strong>${params.serviceName}</strong> (${params.appNumber}) have been dispatched via <strong>${params.deliveryMethod}</strong>.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Digital high-resolution PDF copies are also available for download immediately from your client portal.
    </p>
  `;
  return {
    subject: `Document Dispatched for Delivery: ${params.appNumber}`,
    html: renderEmailLayout({
      title,
      previewText: `Your documents for ${params.appNumber} have been dispatched via ${params.deliveryMethod}.`,
      badge: { text: "Dispatched", color: "green" },
      bodyHtml,
      cta: { text: "View Delivery Tracking", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/deliveries`, color: "gold" },
    }),
  };
}

export function renderDocumentExpiryWarningEmail(params: { name: string; documentTitle: string; expiryDate: Date | string; portalUrl?: string }) {
  const title = "Document Expiry Courtesy Warning";
  const formattedExpiry = new Date(params.expiryDate).toLocaleDateString("en-KE", { dateStyle: "long" });
  const rows: DetailRow[] = [
    { label: "Document Name", value: params.documentTitle, isBold: true },
    { label: "Scheduled Expiry", value: formattedExpiry, isBold: true, highlightColor: "#d97706" },
  ];

  const bodyHtml = `
    <h2 style="color: #d97706; font-size: 18px; margin-top: 0; font-weight: 700;">Dear ${params.name},</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      This is a courtesy compliance reminder that your document <strong>"${params.documentTitle}"</strong> is scheduled to expire on <strong>${formattedExpiry}</strong>.
    </p>
    ${renderEmailDetailsTable(rows)}
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Swift Doc can handle your renewal application seamlessly to ensure continuous business and tax compliance without statutory penalties.
    </p>
  `;
  return {
    subject: `Document Expiry Reminder: ${params.documentTitle}`,
    html: renderEmailLayout({
      title,
      previewText: `Reminder: Your ${params.documentTitle} expires on ${formattedExpiry}.`,
      badge: { text: "Expiry Notice", color: "amber" },
      bodyHtml,
      cta: { text: "Initiate Renewal Filing", href: params.portalUrl || `${DEFAULT_PORTAL_URL}/services`, color: "gold" },
    }),
  };
}

// ============================================================================
// 6. ADMINISTRATIVE NOTIFICATION TEMPLATES
// ============================================================================

export function renderAdminNewRegistrationEmail(params: {
  clientName: string;
  clientNumber: string;
  clientEmail: string;
  clientPhone: string;
  clientType: string;
  adminUrl?: string;
}) {
  const title = "Admin Alert: New Client Registration";
  const rows: DetailRow[] = [
    { label: "Client Name", value: params.clientName, isBold: true },
    { label: "Client Number", value: params.clientNumber, highlightColor: "#c59b27" },
    { label: "Entity Type", value: params.clientType },
    { label: "Email Address", value: params.clientEmail },
    { label: "Phone Contact", value: params.clientPhone },
  ];

  const bodyHtml = `
    <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; font-weight: 700;">Administrative Alert</h2>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      A new client account has registered on Swift Doc and completed profile onboarding.
    </p>
    ${renderEmailDetailsTable(rows)}
  `;
  return {
    subject: `Admin Alert: New Registration - ${params.clientName} (${params.clientNumber})`,
    html: renderEmailLayout({
      title,
      previewText: `New client registration: ${params.clientName} (${params.clientNumber}).`,
      badge: { text: "Admin Alert", color: "gold" },
      bodyHtml,
      cta: { text: "View Client in Admin Center", href: params.adminUrl || `${DEFAULT_PORTAL_URL}/admin/clients`, color: "navy" },
    }),
  };
}
