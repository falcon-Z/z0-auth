/**
 * Welcome Email Template
 */

import { baseTemplate, createButton, escapeHtml } from "./base";
import type { EmailTemplate } from "../types";

export interface WelcomeEmailData {
  userName: string;
  dashboardUrl: string;
  organizationName?: string;
  appName?: string;
  appUrl?: string;
}

export function welcomeTemplate(data: WelcomeEmailData): EmailTemplate {
  const {
    userName,
    dashboardUrl,
    organizationName,
    appName = process.env.APP_NAME ?? "Z0 Auth",
  } = data;

  const subject = `Welcome to ${appName}!`;

  const orgText = organizationName
    ? `<p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">You've been added to <strong>${escapeHtml(organizationName)}</strong>.</p>`
    : "";

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1f2937;">
      Welcome aboard! 🎉
    </h2>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Your account has been verified and you're all set to get started with ${escapeHtml(appName)}.
    </p>
    ${orgText}
    <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
      Here's what you can do next:
    </p>
    <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 16px; color: #4b5563; line-height: 1.8;">
      <li>Complete your profile</li>
      <li>Explore the dashboard</li>
      <li>Set up two-factor authentication for extra security</li>
    </ul>

    ${createButton("Go to Dashboard", dashboardUrl)}

    <p style="margin: 24px 0 0; font-size: 16px; color: #4b5563; line-height: 1.6;">
      If you have any questions, don't hesitate to reach out to our support team.
    </p>
  `;

  const html = baseTemplate({
    title: subject,
    preheader: `You're all set to get started with ${appName}`,
    content,
    footer: "Welcome to the team!",
    appName: data.appName,
    appUrl: data.appUrl,
  });

  const text = `
Welcome to ${appName}!

Hi ${userName},

Your account has been verified and you're all set to get started.

${organizationName ? `You've been added to ${organizationName}.` : ""}

Here's what you can do next:
- Complete your profile
- Explore the dashboard
- Set up two-factor authentication for extra security

Go to Dashboard: ${dashboardUrl}

If you have any questions, don't hesitate to reach out to our support team.

---
${appName}
  `.trim();

  return { subject, html, text };
}
