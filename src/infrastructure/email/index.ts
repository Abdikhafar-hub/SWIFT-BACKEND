import { env } from "../../config/env.js";

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
  sendWelcomeEmail(to: string, name: string): Promise<SendEmailOutput>;
  sendApplicationCreatedEmail(to: string, name: string, appNumber: string, serviceName: string): Promise<SendEmailOutput>;
  sendRequirementNeededEmail(to: string, name: string, appNumber: string, requirementName: string): Promise<SendEmailOutput>;
  sendDocumentApprovedEmail(to: string, name: string, appNumber: string, documentTitle: string): Promise<SendEmailOutput>;
  sendDocumentRejectedEmail(to: string, name: string, appNumber: string, documentTitle: string, reason: string): Promise<SendEmailOutput>;
  sendPaymentReceivedEmail(to: string, name: string, appNumber: string, amount: string, receiptNumber: string): Promise<SendEmailOutput>;
  sendApplicationStatusUpdatedEmail(to: string, name: string, appNumber: string, newStatus: string): Promise<SendEmailOutput>;
  sendApplicationCompletedEmail(to: string, name: string, appNumber: string): Promise<SendEmailOutput>;
  sendPasswordResetEmail(to: string, name: string, resetToken: string, resetLink: string): Promise<SendEmailOutput>;
  sendPasswordResetSuccessEmail(to: string, name: string): Promise<SendEmailOutput>;
}

export class MockEmailProvider implements IEmailService {
  public sentEmails: SendEmailInput[] = [];

  async sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
    const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push(input);
    return { success: true, messageId };
  }

  async sendWelcomeEmail(to: string, name: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: "Welcome to Swift Doc Documentation Services",
      html: `<h1>Welcome ${name}!</h1><p>Your Swift Doc account has been created. You can now access your applications, requirements, and document delivery portal.</p>`,
    });
  }

  async sendApplicationCreatedEmail(to: string, name: string, appNumber: string, serviceName: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Application Lodged: ${appNumber} - ${serviceName}`,
      html: `<h2>Dear ${name},</h2><p>Your application <strong>${appNumber}</strong> for <strong>${serviceName}</strong> has been received and initialized in our system.</p>`,
    });
  }

  async sendRequirementNeededEmail(to: string, name: string, appNumber: string, requirementName: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Action Required: Outstanding Requirement for ${appNumber}`,
      html: `<h2>Dear ${name},</h2><p>Please upload or provide <strong>${requirementName}</strong> for application <strong>${appNumber}</strong>.</p>`,
    });
  }

  async sendDocumentApprovedEmail(to: string, name: string, appNumber: string, documentTitle: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Document Approved: ${documentTitle} (${appNumber})`,
      html: `<h2>Dear ${name},</h2><p>Your document <strong>${documentTitle}</strong> for application <strong>${appNumber}</strong> has been reviewed and approved.</p>`,
    });
  }

  async sendDocumentRejectedEmail(to: string, name: string, appNumber: string, documentTitle: string, reason: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Document Resubmission Required: ${documentTitle} (${appNumber})`,
      html: `<h2>Dear ${name},</h2><p>Your document <strong>${documentTitle}</strong> requires correction: ${reason}. Please re-upload via your client portal.</p>`,
    });
  }

  async sendPaymentReceivedEmail(to: string, name: string, appNumber: string, amount: string, receiptNumber: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Payment Receipt: ${receiptNumber} (${appNumber})`,
      html: `<h2>Dear ${name},</h2><p>Payment of <strong>KES ${amount}</strong> for application <strong>${appNumber}</strong> has been confirmed. Receipt: ${receiptNumber}.</p>`,
    });
  }

  async sendApplicationStatusUpdatedEmail(to: string, name: string, appNumber: string, newStatus: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Status Update: ${appNumber} is now ${newStatus}`,
      html: `<h2>Dear ${name},</h2><p>Application <strong>${appNumber}</strong> has moved to status: <strong>${newStatus}</strong>.</p>`,
    });
  }

  async sendApplicationCompletedEmail(to: string, name: string, appNumber: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: `Application Completed: ${appNumber}`,
      html: `<h2>Dear ${name},</h2><p>Great news! Application <strong>${appNumber}</strong> has been successfully completed and your final deliverables are ready.</p>`,
    });
  }

  async sendPasswordResetEmail(to: string, name: string, resetToken: string, resetLink: string): Promise<SendEmailOutput> {
    console.log(`[EMAIL] Password reset token generated for ${to}: ${resetToken}`);
    console.log(`[EMAIL] Password reset link: ${resetLink}`);
    return this.sendEmail({
      to,
      subject: "Password Reset Request - Swift Doc",
      html: `<h2>Dear ${name},</h2>
<p>We received a request to reset your Swift Doc account password.</p>
<p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#c59b27;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Reset Password</a></p>
<p>Alternatively, copy and paste this link into your browser:</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>This password reset link will expire in 1 hour.</p>
<p>If you did not request a password reset, please disregard this email.</p>`,
    });
  }

  async sendPasswordResetSuccessEmail(to: string, name: string): Promise<SendEmailOutput> {
    return this.sendEmail({
      to,
      subject: "Password Reset Successful - Swift Doc",
      html: `<h2>Dear ${name},</h2>
<p>Your password for Swift Doc has been reset successfully. You can now sign in using your new password.</p>
<p>If you did not make this change, please contact our support team immediately at compliance@swiftdoc.co.ke.</p>`,
    });
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
