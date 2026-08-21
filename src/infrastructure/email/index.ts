import { env } from "../../config/env.js";
import {
  renderEmailVerificationEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPasswordResetSuccessEmail,
  renderApplicationCreatedEmail,
  renderApplicationStatusUpdatedEmail,
  renderRequirementNeededEmail,
  renderDocumentApprovedEmail,
  renderDocumentRejectedEmail,
  renderPaymentReceivedEmail,
  renderInvoiceIssuedEmail,
  renderRefundCompletedEmail,
  renderDeliveryDispatchedEmail,
  renderDocumentExpiryWarningEmail,
  renderAdminNewRegistrationEmail,
  renderEmailChangeOtpEmail,
  renderAdminPasswordChangedEmail,
} from "./email-templates.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailOutput {
  success: boolean;
  messageId: string;
}

export interface IEmailService {
  sendEmail(input: SendEmailInput): Promise<SendEmailOutput>;
  sendEmailVerificationEmail(to: string, name: string, otp: string, expiresMinutes?: number): Promise<SendEmailOutput>;
  sendWelcomeEmail(to: string, name: string, clientNumber?: string): Promise<SendEmailOutput>;
  sendPasswordResetEmail(to: string, name: string, resetLink: string, expiresMinutes?: number): Promise<SendEmailOutput>;
  sendPasswordResetSuccessEmail(to: string, name: string): Promise<SendEmailOutput>;
  sendEmailChangeOtpEmail(to: string, name: string, newEmail: string, otp: string, expiresMinutes?: number): Promise<SendEmailOutput>;
  sendAdminPasswordChangedEmail(to: string, name: string): Promise<SendEmailOutput>;
  sendApplicationCreatedEmail(to: string, name: string, appNumber: string, serviceName: string): Promise<SendEmailOutput>;
  sendApplicationStatusUpdatedEmail(to: string, name: string, appNumber: string, newStatus: string, statusDescription?: string): Promise<SendEmailOutput>;
  sendRequirementNeededEmail(to: string, name: string, appNumber: string, requirementName: string, deadline?: string): Promise<SendEmailOutput>;
  sendDocumentApprovedEmail(to: string, name: string, appNumber: string, documentTitle: string): Promise<SendEmailOutput>;
  sendDocumentRejectedEmail(to: string, name: string, appNumber: string, documentTitle: string, reason: string): Promise<SendEmailOutput>;
  sendPaymentReceivedEmail(to: string, name: string, appNumber: string, amount: string, receiptNumber: string, transactionRef?: string): Promise<SendEmailOutput>;
  sendInvoiceIssuedEmail(to: string, name: string, invoiceNumber: string, appNumber: string, serviceName: string, totalAmount: string, dueAt?: string | null): Promise<SendEmailOutput>;
  sendRefundCompletedEmail(to: string, name: string, refundNumber: string, amount: string, invoiceNumber?: string, appNumber?: string): Promise<SendEmailOutput>;
  sendDeliveryDispatchedEmail(to: string, name: string, appNumber: string, serviceName: string, deliveryMethod: string, trackingNumber?: string): Promise<SendEmailOutput>;
  sendDocumentExpiryWarningEmail(to: string, name: string, documentTitle: string, expiryDate: Date | string): Promise<SendEmailOutput>;
  sendAdminNewRegistrationEmail(to: string, clientName: string, clientNumber: string, clientEmail: string, clientPhone: string, clientType: string): Promise<SendEmailOutput>;
}

export class MockEmailProvider implements IEmailService {
  public sentEmails: SendEmailInput[] = [];

  async sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
    const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push(input);
    return { success: true, messageId };
  }

  async sendEmailVerificationEmail(to: string, name: string, otp: string, expiresMinutes: number = 10): Promise<SendEmailOutput> {
    console.log(`[EMAIL] OTP Verification Email dispatched to ${to}: Code ${otp}`);
    const tmpl = renderEmailVerificationEmail({ name, otp, expiresMinutes });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendWelcomeEmail(to: string, name: string, clientNumber?: string): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Welcome & Account Activated Email dispatched to ${to}`);
    const tmpl = renderWelcomeEmail({ name, clientNumber });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendPasswordResetEmail(to: string, name: string, resetLink: string, expiresMinutes: number = 60): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Password Reset Email dispatched to ${to}`);
    const tmpl = renderPasswordResetEmail({ name, resetLink, expiresMinutes });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendPasswordResetSuccessEmail(to: string, name: string): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Password Reset Success Email dispatched to ${to}`);
    const tmpl = renderPasswordResetSuccessEmail({ name });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendEmailChangeOtpEmail(to: string, name: string, newEmail: string, otp: string, expiresMinutes: number = 10): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Email Change OTP Verification Email dispatched to ${to} (new email: ${newEmail}): OTP ${otp}`);
    const tmpl = renderEmailChangeOtpEmail({ name, newEmail, otp, expiresMinutes });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendAdminPasswordChangedEmail(to: string, name: string): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Admin Password Changed Security Notification dispatched to ${to}`);
    const tmpl = renderAdminPasswordChangedEmail({ name });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendApplicationCreatedEmail(to: string, name: string, appNumber: string, serviceName: string): Promise<SendEmailOutput> {
    const tmpl = renderApplicationCreatedEmail({ name, appNumber, serviceName });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendApplicationStatusUpdatedEmail(to: string, name: string, appNumber: string, newStatus: string, statusDescription?: string): Promise<SendEmailOutput> {
    const tmpl = renderApplicationStatusUpdatedEmail({ name, appNumber, serviceName: "Statutory Service", newStatus, statusDescription });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendRequirementNeededEmail(to: string, name: string, appNumber: string, requirementName: string, deadline?: string): Promise<SendEmailOutput> {
    const tmpl = renderRequirementNeededEmail({ name, appNumber, requirementName, deadline });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendDocumentApprovedEmail(to: string, name: string, appNumber: string, documentTitle: string): Promise<SendEmailOutput> {
    const tmpl = renderDocumentApprovedEmail({ name, appNumber, documentTitle });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendDocumentRejectedEmail(to: string, name: string, appNumber: string, documentTitle: string, reason: string): Promise<SendEmailOutput> {
    const tmpl = renderDocumentRejectedEmail({ name, appNumber, documentTitle, reason });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendPaymentReceivedEmail(to: string, name: string, appNumber: string, amount: string, receiptNumber: string, transactionRef?: string): Promise<SendEmailOutput> {
    const tmpl = renderPaymentReceivedEmail({ name, appNumber, amount, receiptNumber, transactionRef });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendInvoiceIssuedEmail(to: string, name: string, invoiceNumber: string, appNumber: string, serviceName: string, totalAmount: string, dueAt?: string | null): Promise<SendEmailOutput> {
    const tmpl = renderInvoiceIssuedEmail({ name, invoiceNumber, appNumber, serviceName, totalAmount, dueAt });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendRefundCompletedEmail(to: string, name: string, refundNumber: string, amount: string, invoiceNumber?: string, appNumber?: string): Promise<SendEmailOutput> {
    const tmpl = renderRefundCompletedEmail({ name, refundNumber, amount, invoiceNumber, appNumber });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendDeliveryDispatchedEmail(to: string, name: string, appNumber: string, serviceName: string, deliveryMethod: string, trackingNumber?: string): Promise<SendEmailOutput> {
    const tmpl = renderDeliveryDispatchedEmail({ name, appNumber, serviceName, deliveryMethod, trackingNumber });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendDocumentExpiryWarningEmail(to: string, name: string, documentTitle: string, expiryDate: Date | string): Promise<SendEmailOutput> {
    const tmpl = renderDocumentExpiryWarningEmail({ name, documentTitle, expiryDate });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }

  async sendAdminNewRegistrationEmail(to: string, clientName: string, clientNumber: string, clientEmail: string, clientPhone: string, clientType: string): Promise<SendEmailOutput> {
    const tmpl = renderAdminNewRegistrationEmail({ clientName, clientNumber, clientEmail, clientPhone, clientType });
    return this.sendEmail({ to, subject: tmpl.subject, html: tmpl.html });
  }
}

export class ResendEmailProvider extends MockEmailProvider {
  private apiKey: string;
  private fromEmail: string;

  constructor() {
    super();
    this.apiKey = env.RESEND_API_KEY;
    this.fromEmail = env.RESEND_FROM_EMAIL;
  }

  override async sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
    this.sentEmails.push(input);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!response.ok) {
        return super.sendEmail(input);
      }

      const data = (await response.json()) as { id: string };
      return { success: true, messageId: data.id };
    } catch {
      return super.sendEmail(input);
    }
  }
}

export const emailService: IEmailService =
  env.RESEND_API_KEY && env.RESEND_API_KEY !== "mock_resend_api_key"
    ? new ResendEmailProvider()
    : new MockEmailProvider();
