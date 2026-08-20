export interface TemplateContext {
  clientName: string;
  applicationNumber?: string;
  serviceName?: string;
  agency?: string;
  externalReference?: string;
  status?: string;
  statusDescription?: string;
  actionTitle?: string;
  actionDescription?: string;
  deadline?: string | Date;
  deliveryMethod?: string;
  trackingNumber?: string;
  documentTitle?: string;
  expiryDate?: string | Date;
  amount?: string | number;
  portalUrl?: string;
}

export function wrapBrandedEmail(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #d97706;">
              <h1 style="margin: 0; color: #f59e0b; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">SWIFT DOC</h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Document Processing Platform • Nairobi, Kenya</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 24px;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;"><strong>Swift Doc Kenya</strong> • Unga House, Muthithi Road, Westlands, Nairobi</p>
              <p style="margin: 0;">Support: +254 729 732 142 | info@swiftdoc.co.ke</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const NotificationTemplates = {
  applicationCreated: (ctx: TemplateContext) => {
    const title = `Application Received: ${ctx.applicationNumber}`;
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Application Received</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your application for <strong>${ctx.serviceName}</strong> has been received by our operations team.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Reference:</strong> ${ctx.applicationNumber}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Service:</strong> ${ctx.serviceName}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Status:</strong> Requirements Verification In Progress</p>
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">We are currently verifying your submitted documents against official government requirements.</p>
      `
    );
    const sms = `Swift Doc: Your application ${ctx.applicationNumber} for ${ctx.serviceName} has been received. Our team is verifying requirements.`;
    return { title, html, sms };
  },

  applicationStatusUpdated: (ctx: TemplateContext) => {
    const title = `Application Status Update: ${ctx.applicationNumber} is now ${ctx.status}`;
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Application Status Update</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your application <strong>${ctx.applicationNumber}</strong> (${ctx.serviceName}) has updated to <strong>${ctx.status}</strong>.</p>
      ${ctx.statusDescription ? `<p style="color: #64748b; font-size: 13px;">${ctx.statusDescription}</p>` : ""}
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You can log in to your Swift Doc account at any time to monitor progress.</p>
      `
    );
    const sms = `Swift Doc: Application ${ctx.applicationNumber} updated to ${ctx.status}. Track progress on your portal.`;
    return { title, html, sms };
  },

  clientActionRequired: (ctx: TemplateContext) => {
    const title = `Action Required: ${ctx.actionTitle || "Action Needed on Your Application"}`;
    const deadlineFormatted = ctx.deadline ? new Date(ctx.deadline).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "Promptly";
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #b45309; font-size: 18px; margin-top: 0;">Action Required from You</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">An action is required to proceed with your application <strong>${ctx.applicationNumber}</strong> (${ctx.serviceName}).</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #92400e;">${ctx.actionTitle}</p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #78350f; line-height: 1.5;">${ctx.actionDescription}</p>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #b45309;"><strong>Deadline:</strong> ${deadlineFormatted}</p>
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Please log in to your Swift Doc account to complete this action promptly to prevent delays in processing.</p>
      `
    );
    const sms = `Swift Doc: Action needed on application ${ctx.applicationNumber}: ${ctx.actionTitle}. Please log in to complete before ${deadlineFormatted}.`;
    return { title, html, sms };
  },

  governmentUpdate: (ctx: TemplateContext) => {
    const title = `Government Update: ${ctx.agency || "Official Processing"} - ${ctx.applicationNumber}`;
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Government Processing Update</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">There is a status update on your application <strong>${ctx.applicationNumber}</strong> (${ctx.serviceName}) with <strong>${ctx.agency || "the Government Agency"}</strong>.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Status:</strong> ${ctx.status}</p>
        ${ctx.externalReference ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Gov Tracking Ref:</strong> ${ctx.externalReference}</p>` : ""}
        ${ctx.statusDescription ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Details:</strong> ${ctx.statusDescription}</p>` : ""}
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You can track real-time progress on your client dashboard.</p>
      `
    );
    const sms = `Swift Doc: Government update for ${ctx.applicationNumber} (${ctx.agency || "Official"}): Status is ${ctx.status}. Ref: ${ctx.externalReference || "N/A"}.`;
    return { title, html, sms };
  },

  documentExpiryWarning: (ctx: TemplateContext) => {
    const title = `Document Expiry Reminder: ${ctx.documentTitle || "Official Document"}`;
    const expiryFormatted = ctx.expiryDate ? new Date(ctx.expiryDate).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "Soon";
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #d97706; font-size: 18px; margin-top: 0;">Document Expiry Reminder</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">This is a courtesy reminder that your document <strong>${ctx.documentTitle}</strong> is scheduled to expire on <strong>${expiryFormatted}</strong>.</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #78350f;"><strong>Document:</strong> ${ctx.documentTitle}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #78350f;"><strong>Expiry Date:</strong> ${expiryFormatted}</p>
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Swift Doc can assist you in renewing your document before it expires to avoid penalties or compliance interruptions.</p>
      `
    );
    const sms = `Swift Doc Reminder: Your ${ctx.documentTitle} expires on ${expiryFormatted}. Initiate your renewal easily on Swift Doc.`;
    return { title, html, sms };
  },

  deliveryDispatched: (ctx: TemplateContext) => {
    const title = `Document Dispatched for Delivery: ${ctx.applicationNumber}`;
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #059669; font-size: 18px; margin-top: 0;">Your Document is on the Way!</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear <strong>${ctx.clientName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Great news! Your completed document for <strong>${ctx.serviceName}</strong> (${ctx.applicationNumber}) has been dispatched.</p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #166534;"><strong>Method:</strong> ${ctx.deliveryMethod}</p>
        ${ctx.trackingNumber ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #166534;"><strong>Courier Tracking No:</strong> ${ctx.trackingNumber}</p>` : ""}
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Digital copies are also immediately downloadable from your client portal.</p>
      `
    );
    const sms = `Swift Doc: Your documents for ${ctx.applicationNumber} have been dispatched via ${ctx.deliveryMethod}. Tracking: ${ctx.trackingNumber || "Portal"}.`;
    return { title, html, sms };
  },

  adminNewRegistration: (ctx: { clientName: string; clientNumber: string; clientEmail: string; clientPhone: string; clientType: string }) => {
    const title = `New Client Registration: ${ctx.clientName} (${ctx.clientNumber})`;
    const html = wrapBrandedEmail(
      title,
      `
      <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">New Client Registration</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">A new client account has been registered on Swift Doc and is awaiting administrative intake review.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Client Name:</strong> ${ctx.clientName}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Client Number:</strong> ${ctx.clientNumber}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Entity Type:</strong> ${ctx.clientType}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Email:</strong> ${ctx.clientEmail}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Phone:</strong> ${ctx.clientPhone}</p>
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Access the <strong>New Registrations</strong> queue in the Admin Command Center to review this client's profile.</p>
      `
    );
    const sms = `Swift Doc Admin Alert: New client ${ctx.clientName} (${ctx.clientNumber}, ${ctx.clientType}) registered. Review in Admin Command Center.`;
    return { title, html, sms };
  },
};
