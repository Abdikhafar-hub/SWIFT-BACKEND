/**
 * SWIFT DOC CENTRALIZED EMAIL DESIGN SYSTEM & BUILDER
 * ---------------------------------------------------
 * Provides cross-client (Gmail, Outlook, Apple Mail, Mobile) compatible HTML email primitives.
 * Theme: Gold & Ink luxury corporate styling.
 */

export interface EmailLayoutOptions {
  title: string;
  previewText?: string;
  badge?: { text: string; color?: "gold" | "green" | "amber" | "red" | "blue" };
  bodyHtml: string;
  cta?: { text: string; href: string; color?: "gold" | "navy" };
  securityNotice?: string;
  showSupportBlock?: boolean;
}

export interface DetailRow {
  label: string;
  value: string;
  isBold?: boolean;
  highlightColor?: string;
}

/**
 * Renders a status badge pill
 */
export function renderEmailBadge(text: string, color: "gold" | "green" | "amber" | "red" | "blue" = "gold"): string {
  const colorMap = {
    gold: "background-color: #fef3c7; color: #92400e; border: 1px solid #f59e0b;",
    green: "background-color: #d1fae5; color: #065f46; border: 1px solid #10b981;",
    amber: "background-color: #ffedd5; color: #9a3412; border: 1px solid #f97316;",
    red: "background-color: #fee2e2; color: #991b1b; border: 1px solid #ef4444;",
    blue: "background-color: #e0f2fe; color: #075985; border: 1px solid #0284c7;",
  };

  return `<span style="display: inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; border-radius: 9999px; ${colorMap[color]}">${text}</span>`;
}

/**
 * Renders a high-contrast CTA button wrapper
 */
export function renderEmailButton(text: string, href: string, color: "gold" | "navy" = "gold"): string {
  const bg = color === "gold" ? "#c59b27" : "#0f172a";
  const hoverBg = color === "gold" ? "#a8811d" : "#1e293b";
  return `
    <table border="0" cellspacing="0" cellpadding="0" style="margin: 24px auto;">
      <tr>
        <td align="center" style="background-color: ${bg}; border-radius: 6px;">
          <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.5px; background-color: ${bg}; border: 1px solid ${hoverBg};">
            ${text} &rarr;
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renders a prominent 6-Digit OTP display box
 */
export function renderEmailOtpBadge(otpCode: string, expiresMinutes: number = 10): string {
  return `
    <div style="background-color: #fcf8ec; border: 2px dashed #c59b27; padding: 24px 16px; text-align: center; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #78350f;">Your Verification OTP</p>
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #0f172a; margin: 8px 0;">
        ${otpCode}
      </div>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #92400e;">
        Expires in <strong>${expiresMinutes} minutes</strong> • Do not share this code with anyone.
      </p>
    </div>
  `;
}

/**
 * Renders a structured key-value details table
 */
export function renderEmailDetailsTable(rows: DetailRow[]): string {
  const rowHtml = rows
    .map(
      (r, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? "background-color: #f8fafc;" : ""}">
        <td style="padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; width: 40%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          ${r.label}
        </td>
        <td style="padding: 10px 14px; font-size: 13px; color: ${r.highlightColor || "#0f172a"}; font-weight: ${r.isBold ? "700" : "500"}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          ${r.value}
        </td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background-color: #ffffff;">
        <tbody>
          ${rowHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders a security or alert warning box
 */
export function renderEmailSecurityNotice(noticeText: string, type: "warning" | "info" = "warning"): string {
  const isWarn = type === "warning";
  const bg = isWarn ? "#fffbeb" : "#f0f9ff";
  const border = isWarn ? "#f59e0b" : "#0284c7";
  const textCol = isWarn ? "#92400e" : "#075985";

  return `
    <div style="background-color: ${bg}; border-left: 4px solid ${border}; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: ${textCol};">
        <strong>Security Notice:</strong> ${noticeText}
      </p>
    </div>
  `;
}

/**
 * Renders the standardized Swift Doc support contact block
 */
export function renderEmailSupportBlock(): string {
  return `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 24px 0; text-align: left;">
      <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Need Assistance?</p>
      <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
        Our Client Support and Compliance team is available Monday &ndash; Friday, 8:00 AM &ndash; 5:00 PM EAT.<br/>
        <strong>Email:</strong> <a href="mailto:support@swiftdoc.co.ke" style="color: #c59b27; text-decoration: none;">support@swiftdoc.co.ke</a> &bull; 
        <strong>Helpline:</strong> <a href="tel:+254729732142" style="color: #c59b27; text-decoration: none;">+254 729 732 142</a>
      </p>
    </div>
  `;
}

/**
 * Master HTML Layout Renderer
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">
  ${opts.previewText ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${opts.previewText}</div>` : ""}
  
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0b1329; padding: 28px 24px; text-align: center; border-bottom: 3px solid #c59b27;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #c59b27; color: #0b1329; font-weight: 900; font-size: 16px; width: 34px; height: 34px; line-height: 34px; border-radius: 4px; text-align: center; margin-bottom: 8px;">
                      SD
                    </div>
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      SWIFT DOC
                    </h1>
                    <p style="margin: 4px 0 0 0; color: #c59b27; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">
                      Statutory & Consular Documentation Platform
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Surface -->
          <tr>
            <td style="padding: 32px 28px;">
              ${opts.badge ? `<div style="margin-bottom: 16px;">${renderEmailBadge(opts.badge.text, opts.badge.color)}</div>` : ""}
              ${opts.bodyHtml}
              ${opts.cta ? renderEmailButton(opts.cta.text, opts.cta.href, opts.cta.color) : ""}
              ${opts.securityNotice ? renderEmailSecurityNotice(opts.securityNotice) : ""}
              ${opts.showSupportBlock !== false ? renderEmailSupportBlock() : ""}
            </td>
          </tr>

          <!-- Corporate Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 28px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 700; color: #0f172a;">
                Swift Doc Kenya Limited
              </p>
              <p style="margin: 0 0 8px 0; color: #64748b;">
                Unga House, 4th Floor, Muthithi Road, Westlands &bull; P.O. Box 48920-00100, Nairobi, Kenya
              </p>
              <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 11px;">
                Official statutory partner for Business Registration Service (BRS), Kenya Revenue Authority (KRA), Department of Immigration Services, and Foreign Consulates.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                Compliant with the Kenya Data Protection Act 2019. &copy; ${new Date().getFullYear()} Swift Doc Kenya. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
