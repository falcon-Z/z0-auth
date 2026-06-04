import type {
  EmailSettingsResponse,
  PutEmailSettingsRequest,
  SmtpEncryption,
} from "@z0/contracts/email-settings";
import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";

import { decryptSecret, encryptSecret } from "./settings-crypto";
import { getDb } from "./db";
import { problem } from "./http";

type SmtpRow = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  password_ciphertext: string | null;
  from_address: string;
  from_name: string | null;
  enabled: boolean;
  verified_at: Date | null;
  updated_at: Date;
};

function mapRow(row: SmtpRow): EmailSettingsResponse {
  const host = row.host?.trim() ?? "";
  const fromAddress = row.from_address?.trim() ?? "";
  const configured = host.length > 0 && fromAddress.length > 0 && Boolean(row.password_ciphertext);
  return {
    configured,
    enabled: row.enabled && configured,
    host,
    port: Number(row.port) || 587,
    encryption: row.encryption,
    username: row.username,
    hasPassword: Boolean(row.password_ciphertext),
    fromAddress,
    fromName: row.from_name,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getEmailSettingsForApi(): Promise<EmailSettingsResponse> {
  const [row] = await getDb()`
    SELECT
      host,
      port,
      encryption,
      username,
      password_ciphertext,
      from_address,
      from_name,
      enabled,
      verified_at,
      updated_at
    FROM smtp_settings
    WHERE id = 1
  `;
  if (!row) {
    return {
      configured: false,
      enabled: false,
      host: "",
      port: 587,
      encryption: "starttls",
      username: null,
      hasPassword: false,
      fromAddress: "",
      fromName: null,
      verifiedAt: null,
      updatedAt: null,
    };
  }
  return mapRow(row as SmtpRow);
}

function validateEncryption(value: string): SmtpEncryption | null {
  if (value === "none" || value === "starttls" || value === "tls") return value;
  return null;
}

export async function putEmailSettings(
  body: PutEmailSettingsRequest,
): Promise<{ ok: true; settings: EmailSettingsResponse } | { ok: false; response: Response }> {
  const host = body.host?.trim() ?? "";
  const fromAddress = body.fromAddress?.trim() ?? "";
  const port = Number(body.port);
  const encryption = validateEncryption(body.encryption);

  const errors: { field: string; code: string; message: string }[] = [];
  if (!host) errors.push({ field: "host", code: ErrorCodes.REQUIRED, message: "SMTP host is required" });
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push({ field: "port", code: ErrorCodes.REQUIRED, message: "Enter a valid port (1–65535)" });
  }
  if (!encryption) {
    errors.push({ field: "encryption", code: ErrorCodes.REQUIRED, message: "Choose an encryption mode" });
  }
  if (!fromAddress) {
    errors.push({ field: "fromAddress", code: ErrorCodes.REQUIRED, message: "From address is required" });
  } else {
    errors.push(...validateEmail(fromAddress).map((e) => ({ ...e, field: "fromAddress" })));
  }
  if (encryption === "none" && process.env.NODE_ENV === "production") {
    errors.push({
      field: "encryption",
      code: ErrorCodes.REQUIRED,
      message: "Unencrypted SMTP is not allowed in production",
    });
  }
  if (errors.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid email settings.", { errors }),
    };
  }

  const [existing] = await getDb()`
    SELECT password_ciphertext FROM smtp_settings WHERE id = 1
  `;
  const existingCipher = (existing as { password_ciphertext: string | null } | undefined)?.password_ciphertext;

  let passwordCipher = existingCipher;
  const passwordInput = body.password;
  if (passwordInput !== undefined && passwordInput !== null && passwordInput !== "") {
    passwordCipher = await encryptSecret(passwordInput);
  } else if (!existingCipher && body.enabled) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "SMTP password is required.", {
        errors: [{ field: "password", code: ErrorCodes.REQUIRED, message: "SMTP password is required" }],
      }),
    };
  }

  await getDb()`
    UPDATE smtp_settings
    SET
      host = ${host},
      port = ${port},
      encryption = ${encryption},
      username = ${body.username?.trim() || null},
      password_ciphertext = ${passwordCipher},
      from_address = ${fromAddress},
      from_name = ${body.fromName?.trim() || null},
      enabled = ${body.enabled},
      verified_at = NULL,
      updated_at = NOW()
    WHERE id = 1
  `;

  const settings = await getEmailSettingsForApi();
  return { ok: true, settings };
}

export async function markEmailVerified(): Promise<void> {
  await getDb()`
    UPDATE smtp_settings
    SET verified_at = NOW(), updated_at = NOW()
    WHERE id = 1
  `;
}

export async function isSmtpReady(): Promise<boolean> {
  const settings = await getEmailSettingsForApi();
  return settings.enabled && settings.configured;
}

export async function getSmtpCredentialsForSend(): Promise<
  | {
      host: string;
      port: number;
      encryption: SmtpEncryption;
      username: string | null;
      password: string;
      fromAddress: string;
      fromName: string | null;
    }
  | null
> {
  const [row] = await getDb()`
    SELECT
      host,
      port,
      encryption,
      username,
      password_ciphertext,
      from_address,
      from_name,
      enabled
    FROM smtp_settings
    WHERE id = 1
  `;
  if (!row) return null;
  const r = row as SmtpRow;
  if (!r.enabled || !r.password_ciphertext || !r.host?.trim() || !r.from_address?.trim()) return null;

  const password = await decryptSecret(r.password_ciphertext);
  return {
    host: r.host.trim(),
    port: Number(r.port) || 587,
    encryption: r.encryption,
    username: r.username,
    password,
    fromAddress: r.from_address.trim(),
    fromName: r.from_name,
  };
}

export function validateTestRecipient(to: string): { ok: true; email: string } | { ok: false; response: Response } {
  const emailErrors = validateEmail(to);
  if (emailErrors.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid recipient email.", {
        errors: emailErrors.map((e) => ({ ...e, field: "to" })),
      }),
    };
  }
  return { ok: true, email: normalizeEmail(to) };
}
