import type { SmtpSendOptions } from "./smtp-client";
import { sendSmtpMessage } from "./smtp-client";
import { getSmtpCredentialsForSend } from "./smtp-settings";

export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
};

const captured: CapturedEmail[] = [];
let testDelivery: ((email: CapturedEmail) => Promise<{ ok: true }>) | null = null;

export function captureEmailsForTests(): void {
  testDelivery = async (email) => {
    captured.push(email);
    return { ok: true };
  };
}

export function restoreEmailDeliveryForTests(): void {
  testDelivery = null;
}

export function resetCapturedEmailsForTests(): void {
  captured.length = 0;
}

export function getCapturedEmails(): CapturedEmail[] {
  return [...captured];
}

export async function deliverEmail(
  options: Pick<SmtpSendOptions, "to" | "subject" | "text">,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (testDelivery) {
    return testDelivery({ to: options.to, subject: options.subject, text: options.text });
  }

  const creds = await getSmtpCredentialsForSend();
  if (!creds) return { ok: false, message: "SMTP is not configured or not enabled." };

  return sendSmtpMessage({
    ...creds,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}
