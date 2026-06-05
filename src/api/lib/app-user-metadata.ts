import { ErrorCodes } from "@z0/contracts/errors";
import type { FieldError } from "@z0/contracts/errors";

const MAX_METADATA_BYTES = 4096;

export function validateAppUserMetadata(
  value: unknown,
): FieldError[] {
  if (value === undefined) return [];
  if (value === null) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    return [
      {
        field: "metadata",
        code: ErrorCodes.INVALID_METADATA,
        message: "Metadata must be a JSON object",
      },
    ];
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_METADATA_BYTES) {
    return [
      {
        field: "metadata",
        code: ErrorCodes.INVALID_METADATA,
        message: "Metadata must be 4 KB or smaller",
      },
    ];
  }
  return [];
}

export function normalizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  return value;
}
