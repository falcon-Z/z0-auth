import type { SmtpEncryption } from "@z0/contracts/email-settings";

export type SmtpEnvCredentials = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  password: string;
  fromAddress: string;
  fromName: string | null;
};

function parseEncryption(raw: string | undefined): SmtpEncryption | null {
  const value = (raw ?? "starttls").trim().toLowerCase();
  if (value === "none" || value === "starttls" || value === "tls") return value;
  return null;
}

function isEnvDisabled(): boolean {
  const flag = process.env.SMTP_ENABLED?.trim().toLowerCase();
  return flag === "false" || flag === "0" || flag === "no";
}

/** Resolved SMTP credentials from environment. Env wins over console DB when valid. */
export function getSmtpEnvCredentials(): SmtpEnvCredentials | null {
  if (isEnvDisabled()) return null;

  const host = process.env.SMTP_HOST?.trim();
  const fromAddress = process.env.SMTP_FROM_ADDRESS?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!host || !fromAddress || !password) return null;

  const encryption = parseEncryption(process.env.SMTP_ENCRYPTION);
  if (!encryption) return null;

  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  if (encryption === "none" && process.env.NODE_ENV === "production") return null;

  return {
    host,
    port,
    encryption,
    username: process.env.SMTP_USERNAME?.trim() || null,
    password,
    fromAddress,
    fromName: process.env.SMTP_FROM_NAME?.trim() || null,
  };
}

/** True when valid SMTP credentials are fully resolved from environment. */
export function isSmtpEnvManaged(): boolean {
  return getSmtpEnvCredentials() !== null;
}
