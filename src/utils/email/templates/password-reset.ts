/**
 * Password Reset Template
 */

import { baseTemplate, createButton, createInfoBox, escapeHtml } from "./base";
import type { EmailTemplate } from "../types";

export interface PasswordResetEmailData {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
  appName?: string;
  appUrl?: string;
}

export function passwordResetTemplate(data: PasswordResetEmailData): EmailTemplate {
  const {
    userName,
    resetUrl,
    expiresInMinutes = 60,
    ipAddress,
    userAgent,
    appName = process.env.APP_NAME ?? "Z0 Auth",
  } = data;

  const subject = `Reset your password - ${appName}`;

  // Format expiry time
  const expiryText = expiresInMinutes >= 60
    ? `${Math.floor(expiresInMinutes / 60)} hour${expiresInMinutes >= 120 ? "s" : ""}`
    : `${expiresInMinutes} minutes`;

  // Build request details if available
  let requestDetails = "";
  if (ipAddress || userAgent) {
    const details: string[] = [];
    if (ipAddress) details.push(`IP Address: ${escapeHtml(ipAddress)}`);
    if (userAgent) {
      // Extract browser info from user agent
      const browser = extractBrowser(userAgent);
      if (browser) details.push(`Browser: ${escapeHtml(browser)}`);
    }
    if (details.length > 0) {
      requestDetails = `
        <p style="margin: 24px 0 8px; font-size: 14px; color: #6b7280;">
          Request details:
        </p>
        <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 14px; color: #6b7280;">
          ${details.map((d) => `<li style="margin: 4px 0;">${d}</li>`).join("")}
        </ul>
      `;
    }
  }

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1f2937;">
      Reset your password
    </h2>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      We received a request to reset your password. Click the button below to create a new password.
    </p>

    ${createButton("Reset Password", resetUrl)}

    <p style="margin: 24px 0 16px; font-size: 14px; color: #6b7280; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #3b82f6; word-break: break-all;">
      <a href="${escapeHtml(resetUrl)}" style="color: #3b82f6; text-decoration: underline;">
        ${escapeHtml(resetUrl)}
      </a>
    </p>

    ${createInfoBox(`This link will expire in ${expiryText}. If you didn't request a password reset, please ignore this email or contact support if you have concerns.`, "warning")}

    ${requestDetails}
  `;

  const html = baseTemplate({
    title: subject,
    preheader: `Reset your ${appName} password`,
    content,
    footer: "You received this email because a password reset was requested for your account.",
    appName: data.appName,
    appUrl: data.appUrl,
  });

  const text = `
Reset your password

Hi ${userName},

We received a request to reset your password. Click the link below to create a new password.

Reset Link: ${resetUrl}

This link will expire in ${expiryText}.

If you didn't request a password reset, please ignore this email or contact support if you have concerns.

${ipAddress ? `Request IP: ${ipAddress}` : ""}

---
${appName}
This is an automated message. Please do not reply to this email.
  `.trim();

  return { subject, html, text };
}

/**
 * Extract browser name from user agent string
 */
function extractBrowser(userAgent: string): string | null {
  const browsers = [
    { name: "Chrome", pattern: /Chrome\/[\d.]+/ },
    { name: "Firefox", pattern: /Firefox\/[\d.]+/ },
    { name: "Safari", pattern: /Safari\/[\d.]+/ },
    { name: "Edge", pattern: /Edg\/[\d.]+/ },
    { name: "Opera", pattern: /OPR\/[\d.]+/ },
  ];

  for (const { name, pattern } of browsers) {
    if (pattern.test(userAgent)) {
      return name;
    }
  }

  return null;
}
