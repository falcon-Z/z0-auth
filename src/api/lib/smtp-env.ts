import type { SmtpEncryption } from "@z0/contracts/email-settings";

export type SmtpEnvCredentials = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
};

const SMTP_KEYS = [
  "SMTP_HOST", "SMTP_PORT", "SMTP_ENCRYPTION", "SMTP_USERNAME", "SMTP_PASSWORD",
  "SMTP_FROM_ADDRESS", "SMTP_FROM_NAME",
] as const;

function parseEncryption(raw: string | undefined): SmtpEncryption | null {
  const value = (raw ?? "starttls").trim().toLowerCase();
  return value === "none" || value === "starttls" || value === "tls" ? value : null;
}

export function isSmtpEnvDisabled(): boolean {
  return ["false", "0", "no"].includes(process.env.SMTP_ENABLED?.trim().toLowerCase() ?? "");
}

function hasAnySmtpEnvironment(): boolean {
  return SMTP_KEYS.some((key) => Boolean(process.env[key]?.trim()));
}

/** Environment is authoritative when explicitly disabled or when any SMTP value is supplied. */
export function isSmtpEnvManaged(): boolean {
  return isSmtpEnvDisabled() || hasAnySmtpEnvironment();
}

export function getSmtpEnvCredentials(): SmtpEnvCredentials | null {
  if (isSmtpEnvDisabled() || !hasAnySmtpEnvironment()) return null;

  const host = process.env.SMTP_HOST?.trim();
  const fromAddress = process.env.SMTP_FROM_ADDRESS?.trim();
  if (!host || !fromAddress) {
    throw new Error("SMTP environment configuration requires SMTP_HOST and SMTP_FROM_ADDRESS");
  }
  const encryption = parseEncryption(process.env.SMTP_ENCRYPTION);
  if (!encryption) throw new Error("SMTP_ENCRYPTION must be none, starttls, or tls");
  if (encryption === "none" && process.env.NODE_ENV === "production") {
    throw new Error("Unencrypted SMTP is not allowed in production");
  }
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer from 1 to 65535");
  }
  const username = process.env.SMTP_USERNAME?.trim() || null;
  const password = process.env.SMTP_PASSWORD ?? null;
  if (username && !password) throw new Error("SMTP_PASSWORD is required when SMTP_USERNAME is set");

  return {
    host,
    port,
    encryption,
    username,
    password,
    fromAddress,
    fromName: process.env.SMTP_FROM_NAME?.trim() || null,
  };
}
