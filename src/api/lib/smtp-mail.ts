import type { SmtpSendOptions } from "./smtp-client";
import { sendSmtpMessage } from "./smtp-client";
import { getSmtpCredentialsForSend } from "./smtp-settings";

export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
};

const captureEnabled = () => process.env.Z0_SMTP_CAPTURE === "1";

const captured: CapturedEmail[] = [];

export function resetCapturedEmailsForTests(): void {
  captured.length = 0;
}

export function getCapturedEmails(): CapturedEmail[] {
  return [...captured];
}

export async function deliverEmail(
  options: Pick<SmtpSendOptions, "to" | "subject" | "text">,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (captureEnabled()) {
    captured.push({ to: options.to, subject: options.subject, text: options.text });
    return { ok: true };
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
