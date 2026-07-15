import type { SmtpEncryption } from "@z0/contracts/email-settings";
import { validateEmail } from "@z0/contracts/validation";

import {
  ConfigError,
  loadConfig,
  parseEnvironmentBoolean,
  parseEnvironmentInteger,
  validateHostOrIp,
} from "./config";

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
  "SMTP_FROM_ADDRESS", "SMTP_FROM_NAME", "SMTP_ENABLED",
] as const;

function parseEncryption(raw: string | undefined): SmtpEncryption | null {
  const value = (raw ?? "starttls").trim().toLowerCase();
  return value === "none" || value === "starttls" || value === "tls" ? value : null;
}

export function isSmtpEnvDisabled(): boolean {
  return process.env.SMTP_ENABLED !== undefined && !parseEnvironmentBoolean("SMTP_ENABLED", true);
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
    throw new ConfigError(
      ["SMTP_HOST", "SMTP_FROM_ADDRESS"],
      "incomplete",
      "SMTP environment settings require SMTP_HOST and SMTP_FROM_ADDRESS.",
    );
  }
  validateHostOrIp("SMTP_HOST", host);
  if (validateEmail(fromAddress).length > 0) {
    throw new ConfigError(
      ["SMTP_FROM_ADDRESS"],
      "invalid",
      "SMTP_FROM_ADDRESS must be a valid email address.",
    );
  }
  const encryption = parseEncryption(process.env.SMTP_ENCRYPTION);
  if (!encryption) {
    throw new ConfigError(
      ["SMTP_ENCRYPTION"],
      "invalid",
      "SMTP_ENCRYPTION must be none, starttls, or tls.",
    );
  }
  if (encryption === "none" && loadConfig().nodeEnv === "production") {
    throw new ConfigError(
      ["SMTP_ENCRYPTION"],
      "unsafe",
      "SMTP_ENCRYPTION cannot be none in production.",
    );
  }
  const port = parseEnvironmentInteger("SMTP_PORT", 587, { min: 1, max: 65_535 });
  const username = process.env.SMTP_USERNAME?.trim() || null;
  const password = process.env.SMTP_PASSWORD ?? null;
  if (username && username.length > 256) {
    throw new ConfigError(
      ["SMTP_USERNAME"],
      "invalid",
      "SMTP_USERNAME must be 256 characters or fewer.",
    );
  }
  if (username && !password) {
    throw new ConfigError(
      ["SMTP_USERNAME", "SMTP_PASSWORD"],
      "incomplete",
      "SMTP_PASSWORD is required when SMTP_USERNAME is set.",
    );
  }

  return {
    host,
    port,
    encryption,
    username,
    password,
    fromAddress,
    fromName: (() => {
      const value = process.env.SMTP_FROM_NAME?.trim() || null;
      if (value && value.length > 256) {
        throw new ConfigError(
          ["SMTP_FROM_NAME"],
          "invalid",
          "SMTP_FROM_NAME must be 256 characters or fewer.",
        );
      }
      return value;
    })(),
  };
}
