import type { FieldError } from "./errors";
import { createProblemDetail, ErrorCodes } from "./errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): FieldError[] {
  if (typeof email !== "string" || !email.trim()) {
    return [{ field: "email", code: ErrorCodes.REQUIRED, message: "Email is required" }];
  }
  const normalized = email.trim().toLowerCase();
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
  return [];
}

export async function parseJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  try {
    const body = (await req.json()) as T;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify(createProblemDetail(400, "Bad Request", "Invalid JSON body")),
        { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } },
      ),
    };
  }
}
