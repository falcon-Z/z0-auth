import { ErrorCodes } from "@z0/contracts/errors";

import { isDatabaseConnectionError, resetDatabaseConnection } from "./db";
import type { RouteHandler } from "./http";
import { problem } from "./http";

export { isDatabaseConnectionError, resetDatabaseConnection } from "./db";

export function databaseUnavailableResponse(): Response {
  return problem(503, "Service Unavailable", "Database is unavailable. Try again later.", {
    code: ErrorCodes.DATABASE_UNAVAILABLE,
    errors: [
      {
        field: "_database",
        code: ErrorCodes.DATABASE_UNAVAILABLE,
        message: "Database is unavailable. Try again later.",
      },
    ],
  });
}

export async function handleDatabaseConnectionError(error: unknown): Promise<Response | null> {
  if (!isDatabaseConnectionError(error)) return null;
  await resetDatabaseConnection();
  return databaseUnavailableResponse();
}

export function withDatabaseErrorHandling<T extends RouteHandler>(handler: T): T {
  const wrapped = async (req: Parameters<T>[0]) => {
    try {
      return await handler(req);
    } catch (error) {
      const response = await handleDatabaseConnectionError(error);
      if (response) return response;
      throw error;
    }
  };
  return wrapped as T;
}
