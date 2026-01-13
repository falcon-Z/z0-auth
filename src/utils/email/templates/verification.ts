/**
 * Email Verification Template
 */

import { baseTemplate, createButton, createInfoBox, escapeHtml } from "./base";
import type { EmailTemplate } from "../types";

export interface VerificationEmailData {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
  appName?: string;
  appUrl?: string;
}

export function verificationTemplate(data: VerificationEmailData): EmailTemplate {
  const {
    userName,
    verificationUrl,
    expiresInHours = 24,
    appName = process.env.APP_NAME ?? "Z0 Auth",
  } = data;

  const subject = `Verify your email address - ${appName}`;

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1f2937;">
      Verify your email address
    </h2>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Thanks for signing up! Please click the button below to verify your email address and activate your account.
    </p>

    ${createButton("Verify Email Address", verificationUrl)}

    <p style="margin: 24px 0 16px; font-size: 14px; color: #6b7280; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #3b82f6; word-break: break-all;">
      <a href="${escapeHtml(verificationUrl)}" style="color: #3b82f6; text-decoration: underline;">
        ${escapeHtml(verificationUrl)}
      </a>
    </p>

    ${createInfoBox(`This link will expire in ${expiresInHours} hours. If you didn't create an account, you can safely ignore this email.`, "info")}
  `;

  const html = baseTemplate({
    title: subject,
    preheader: `Verify your email to complete your ${appName} registration`,
    content,
    footer: "You received this email because you recently created a new account.",
    appName: data.appName,
    appUrl: data.appUrl,
  });

  const text = `
Verify your email address

Hi ${userName},

Thanks for signing up! Please click the link below to verify your email address and activate your account.

Verification Link: ${verificationUrl}

This link will expire in ${expiresInHours} hours.

If you didn't create an account, you can safely ignore this email.

---
${appName}
This is an automated message. Please do not reply to this email.
  `.trim();

  return { subject, html, text };
}
