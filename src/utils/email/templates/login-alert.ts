/**
 * Login Alert Email Template
 * Sent when a login is detected from a new device or location
 */

import { baseTemplate, createButton, createInfoBox, escapeHtml } from "./base";
import type { EmailTemplate } from "../types";

export interface LoginAlertEmailData {
  userName: string;
  loginTime: Date;
  ipAddress: string;
  location?: string;
  deviceName?: string;
  browserName?: string;
  osName?: string;
  blockUrl: string;
  appName?: string;
  appUrl?: string;
}

export function loginAlertTemplate(data: LoginAlertEmailData): EmailTemplate {
  const {
    userName,
    loginTime,
    ipAddress,
    location,
    deviceName,
    browserName,
    osName,
    blockUrl,
    appName = process.env.APP_NAME ?? "Z0 Auth",
  } = data;

  const subject = `New login detected - ${appName}`;

  // Format login time
  const formattedTime = loginTime.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  // Build device info
  const deviceInfo: string[] = [];
  if (browserName) deviceInfo.push(browserName);
  if (osName) deviceInfo.push(osName);
  if (deviceName) deviceInfo.push(deviceName);

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1f2937;">
      New login detected
    </h2>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      We noticed a new sign-in to your account. If this was you, you can safely ignore this email.
    </p>

    <div style="margin: 24px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1f2937;">
        Login Details
      </h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #6b7280; width: 120px;">Time:</td>
          <td style="padding: 8px 0; font-size: 14px; color: #1f2937;">${escapeHtml(formattedTime)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">IP Address:</td>
          <td style="padding: 8px 0; font-size: 14px; color: #1f2937;">${escapeHtml(ipAddress)}</td>
        </tr>
        ${location ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Location:</td>
          <td style="padding: 8px 0; font-size: 14px; color: #1f2937;">${escapeHtml(location)}</td>
        </tr>
        ` : ""}
        ${deviceInfo.length > 0 ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Device:</td>
          <td style="padding: 8px 0; font-size: 14px; color: #1f2937;">${escapeHtml(deviceInfo.join(" / "))}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    ${createInfoBox("If this wasn't you, click the button below to secure your account immediately. Your password may have been compromised.", "warning")}

    ${createButton("This Wasn't Me - Secure Account", blockUrl)}

    <p style="margin: 24px 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
      For your security, we recommend:
    </p>
    <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 14px; color: #6b7280; line-height: 1.8;">
      <li>Enable two-factor authentication</li>
      <li>Use a strong, unique password</li>
      <li>Review your recent account activity</li>
    </ul>
  `;

  const html = baseTemplate({
    title: subject,
    preheader: `New login to your ${appName} account from ${location ?? ipAddress}`,
    content,
    footer: "This is an automated security alert.",
    appName: data.appName,
    appUrl: data.appUrl,
  });

  const text = `
New login detected

Hi ${userName},

We noticed a new sign-in to your account. If this was you, you can safely ignore this email.

Login Details:
- Time: ${formattedTime}
- IP Address: ${ipAddress}
${location ? `- Location: ${location}` : ""}
${deviceInfo.length > 0 ? `- Device: ${deviceInfo.join(" / ")}` : ""}

If this wasn't you, click here to secure your account: ${blockUrl}

For your security, we recommend:
- Enable two-factor authentication
- Use a strong, unique password
- Review your recent account activity

---
${appName}
This is an automated security alert.
  `.trim();

  return { subject, html, text };
}
