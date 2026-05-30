import type { FieldError, ProblemDetail } from "@z0/contracts/errors";

import { ApiError } from "./http-client";

/** Field name → first validation message (for inline form errors). */
export type FieldErrorMap = Record<string, string>;

export function fieldErrorsFromProblem(problem: ProblemDetail): FieldErrorMap {
  const map: FieldErrorMap = {};
  for (const err of problem.errors ?? []) {
    if (!map[err.field]) map[err.field] = err.message;
  }
  return map;
}

export function fieldErrorsFromUnknown(error: unknown): FieldErrorMap {
  if (error instanceof ApiError) return fieldErrorsFromProblem(error.problem);
  return {};
}

export function firstFieldError(errors: FieldError[]): string | undefined {
  return errors[0]?.message;
}
