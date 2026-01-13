/**
 * Base Email Template
 * Provides the HTML wrapper and common styling for all emails
 */

export interface BaseTemplateOptions {
  title: string;
  preheader?: string;
  content: string;
  footer?: string;
  appName?: string;
  appUrl?: string;
  primaryColor?: string;
}

const DEFAULT_APP_NAME = "Z0 Auth";
const DEFAULT_PRIMARY_COLOR = "#3b82f6"; // Blue

export function baseTemplate(options: BaseTemplateOptions): string {
  const {
    title,
    preheader = "",
    content,
    footer,
    appName = process.env.APP_NAME ?? DEFAULT_APP_NAME,
    appUrl = process.env.APP_URL ?? "",
    primaryColor = process.env.EMAIL_PRIMARY_COLOR ?? DEFAULT_PRIMARY_COLOR,
  } = options;

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
    }
    /* Client-specific styles */
    .ExternalClass {
      width: 100%;
    }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
      line-height: 100%;
    }
    /* Button styles */
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: ${primaryColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
    }
    .button:hover {
      background-color: ${adjustColor(primaryColor, -20)};
    }
    /* Responsive styles */
    @media screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 16px !important;
      }
      .button {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(preheader)}</div>` : ""}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Main Container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px; border-bottom: 1px solid #e5e7eb;">
              ${appUrl ? `<a href="${escapeHtml(appUrl)}" style="text-decoration: none;">` : ""}
                <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: ${primaryColor};">
                  ${escapeHtml(appName)}
                </h1>
              ${appUrl ? "</a>" : ""}
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    ${footer ? `<p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">${footer}</p>` : ""}
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      &copy; ${year} ${escapeHtml(appName)}. All rights reserved.
                    </p>
                    ${appUrl ? `<p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;"><a href="${escapeHtml(appUrl)}" style="color: #6b7280;">${escapeHtml(appUrl)}</a></p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Unsubscribe / Legal -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 24px 16px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                This is an automated message. Please do not reply to this email.
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

/**
 * Create a button HTML element
 */
export function createButton(text: string, url: string, primaryColor?: string): string {
  const color = primaryColor ?? process.env.EMAIL_PRIMARY_COLOR ?? DEFAULT_PRIMARY_COLOR;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="border-radius: 6px; background-color: ${color};">
          <a href="${escapeHtml(url)}" class="button" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Create a code/token display element
 */
export function createCodeDisplay(code: string): string {
  return `
    <div style="margin: 24px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
      <code style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #1f2937; font-family: 'Courier New', monospace;">
        ${escapeHtml(code)}
      </code>
    </div>
  `;
}

/**
 * Create an info box
 */
export function createInfoBox(content: string, type: "info" | "warning" | "success" = "info"): string {
  const colors = {
    info: { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
    warning: { bg: "#fefce8", border: "#eab308", text: "#854d0e" },
    success: { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  };
  const { bg, border, text } = colors[type];

  return `
    <div style="margin: 24px 0; padding: 16px; background-color: ${bg}; border-left: 4px solid ${border}; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: ${text}; line-height: 1.5;">
        ${content}
      </p>
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

/**
 * Adjust color brightness
 */
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
