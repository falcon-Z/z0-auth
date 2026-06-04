import type { FieldError } from "@z0/contracts/errors";
import { ErrorCodes } from "@z0/contracts/errors";

/** Lowercase OAuth-style scope identifiers (1–64 chars). */
export const SCOPE_NAME_PATTERN = /^[a-z][a-z0-9._:/-]{0,63}$/;

const MAX_DESCRIPTION_LENGTH = 256;

export function normalizeScopeName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateScopeName(name: unknown): FieldError[] {
  if (typeof name !== "string") {
    return [{ field: "name", code: ErrorCodes.REQUIRED, message: "Scope name is required" }];
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return [{ field: "name", code: ErrorCodes.REQUIRED, message: "Scope name is required" }];
  }
  const normalized = trimmed.toLowerCase();
  if (normalized !== trimmed) {
    return [
      {
        field: "name",
        code: ErrorCodes.INVALID_SCOPE,
        message: "Scope name must use lowercase letters",
      },
    ];
  }
  if (!SCOPE_NAME_PATTERN.test(normalized)) {
    return [
      {
        field: "name",
        code: ErrorCodes.INVALID_SCOPE,
        message: "Use a letter first, then letters, numbers, or . _ : / -",
      },
    ];
  }
  return [];
}

export function validateScopeDescription(description: unknown): FieldError[] {
  if (description === undefined || description === null) return [];
  if (typeof description !== "string") {
    return [{ field: "description", code: ErrorCodes.REQUIRED, message: "Description must be text" }];
  }
  const trimmed = description.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return [
      {
        field: "description",
        code: ErrorCodes.REQUIRED,
        message: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      },
    ];
  }
  return [];
}
