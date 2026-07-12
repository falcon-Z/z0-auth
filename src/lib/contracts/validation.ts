import type { FieldError } from "./errors";
import { createProblemDetail, ErrorCodes } from "./errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_JSON_BODY_BYTES = 1024 * 1024;

export function validateEmail(email: unknown): FieldError[] {
  if (typeof email !== "string" || !email.trim()) {
    return [{ field: "email", code: ErrorCodes.REQUIRED, message: "Email is required" }];
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254) {
    return [{ field: "email", code: ErrorCodes.TOO_LONG, message: "Email must be 254 characters or fewer" }];
  }
  if (!EMAIL_RE.test(normalized)) {
    return [{ field: "email", code: ErrorCodes.INVALID_EMAIL, message: "Invalid email address" }];
  }
  return [];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateRequiredString(
  value: unknown,
  field: string,
  label: string,
): FieldError[] {
  if (typeof value !== "string" || !value.trim()) {
    return [{ field, code: ErrorCodes.REQUIRED, message: `${label} is required` }];
  }
  if (value.trim().length > 256) {
    return [{ field, code: ErrorCodes.TOO_LONG, message: `${label} must be 256 characters or fewer` }];
  }
  return [];
}

export function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function parseJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: new Response(JSON.stringify(createProblemDetail(415, "Unsupported Media Type", "Content-Type must be application/json")), {
        status: 415,
        headers: { "Content-Type": "application/problem+json; charset=utf-8" },
      }),
    };
  }
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: new Response(JSON.stringify(createProblemDetail(413, "Payload Too Large", "JSON body exceeds 1 MiB")), {
        status: 413,
        headers: { "Content-Type": "application/problem+json; charset=utf-8" },
      }),
    };
  }
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) throw new Error("body_too_large");
    const body = JSON.parse(text) as T;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json_object");
    return { ok: true, body };
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body_too_large";
    return {
      ok: false,
      response: new Response(
        JSON.stringify(createProblemDetail(tooLarge ? 413 : 400, tooLarge ? "Payload Too Large" : "Bad Request", tooLarge ? "JSON body exceeds 1 MiB" : "Invalid JSON body")),
        { status: tooLarge ? 413 : 400, headers: { "Content-Type": "application/problem+json; charset=utf-8" } },
      ),
    };
  }
}
