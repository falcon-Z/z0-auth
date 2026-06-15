import type { EmailDeliveryStatus } from "@z0/contracts/email-delivery";

import { deliverEmail } from "./smtp-mail";
import { isSmtpReady } from "./smtp-settings";

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<{ status: EmailDeliveryStatus; message?: string }> {
  if (!(await isSmtpReady())) {
    return { status: "skipped" };
  }

  const sent = await deliverEmail(input);
  if (!sent.ok) {
    return { status: "failed", message: sent.message };
  }
  return { status: "sent" };
}

export function memberInviteEmailText(options: {
  invitedName: string;
  organizationName: string;
  inviteUrl: string;
  expiresAt: string;
}): { subject: string; text: string } {
  const appName = process.env.APP_NAME ?? "z0-auth";
  const expiresLabel = new Date(options.expiresAt).toLocaleString();
  return {
    subject: `Join ${options.organizationName} on ${appName}`,
    text: [
      `Hi ${options.invitedName},`,
      "",
      `You have been invited to join ${options.organizationName} on ${appName}.`,
      "",
      `Open this link to accept or decline (expires ${expiresLabel}):`,
      options.inviteUrl,
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
  };
}

export function appUserInviteEmailText(options: {
  invitedName: string;
  appName: string;
  inviteUrl: string;
  expiresAt: string;
}): { subject: string; text: string } {
  const expiresLabel = new Date(options.expiresAt).toLocaleString();
  return {
    subject: `Join ${options.appName}`,
    text: [
      `Hi ${options.invitedName},`,
      "",
      `You have been invited to join ${options.appName}.`,
      "",
      `Open this link to create your account (expires ${expiresLabel}):`,
      options.inviteUrl,
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
  };
}

export function magicLinkEmailText(options: {
  appName: string;
  link: string;
  expiresMinutes: number;
}): { subject: string; text: string } {
  return {
    subject: `Sign in to ${options.appName}`,
    text: [
      `Use this link to sign in to ${options.appName} (expires in ${options.expiresMinutes} minutes):`,
      options.link,
      "",
      "If you did not request this link, you can ignore this email.",
    ].join("\n"),
  };
}
