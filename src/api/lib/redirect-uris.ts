import type { FieldError } from "@z0/contracts/errors";
import { ErrorCodes } from "@z0/contracts/errors";

const MAX_REDIRECT_URIS = 20;
const MAX_URI_LENGTH = 2048;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function validateOneRedirectUri(uri: string, nodeEnv: string): FieldError | null {
  const trimmed = uri.trim();
  if (!trimmed) {
    return {
      field: "redirectUris",
      code: ErrorCodes.REQUIRED,
      message: "Redirect URI cannot be empty",
    };
  }
  if (trimmed.length > MAX_URI_LENGTH) {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Redirect URI is too long",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Redirect URI must be a valid URL",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Redirect URI cannot include credentials",
    };
  }

  if (parsed.hash) {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Redirect URI cannot include a fragment",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Redirect URI must use http or https",
    };
  }

  const local = isLocalHost(parsed.hostname);
  if (nodeEnv === "production" && parsed.protocol !== "https:" && !local) {
    return {
      field: "redirectUris",
      code: ErrorCodes.INVALID_REDIRECT_URI,
      message: "Production redirect URIs must use https",
    };
  }

  return null;
}

/** Normalize, dedupe, and validate redirect URIs for app registration. */
export function validateRedirectUris(
  value: unknown,
  nodeEnv: string,
): { ok: true; uris: string[] } | { ok: false; errors: FieldError[] } {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      errors: [
        {
          field: "redirectUris",
          code: ErrorCodes.REQUIRED,
          message: "At least one redirect URI is required",
        },
      ],
    };
  }

  if (value.length > MAX_REDIRECT_URIS) {
    return {
      ok: false,
      errors: [
        {
          field: "redirectUris",
          code: ErrorCodes.INVALID_REDIRECT_URI,
          message: `At most ${MAX_REDIRECT_URIS} redirect URIs are allowed`,
        },
      ],
    };
  }

  const seen = new Set<string>();
  const uris: string[] = [];
  const errors: FieldError[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      errors.push({
        field: "redirectUris",
        code: ErrorCodes.INVALID_REDIRECT_URI,
        message: "Each redirect URI must be a string",
      });
      continue;
    }
    const err = validateOneRedirectUri(item, nodeEnv);
    if (err) {
      errors.push(err);
      continue;
    }
    const normalized = item.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    uris.push(normalized);
  }

  if (errors.length > 0) return { ok: false, errors };
  if (uris.length === 0) {
    return {
      ok: false,
      errors: [
        {
          field: "redirectUris",
          code: ErrorCodes.REQUIRED,
          message: "At least one redirect URI is required",
        },
      ],
    };
  }

  return { ok: true, uris };
}
