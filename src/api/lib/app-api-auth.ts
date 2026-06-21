import { ErrorCodes } from "@z0/contracts/errors";

import { findOAuthAccessToken, parseScopeSet } from "./oauth";
import { problem } from "./http";
import { requireScope } from "./platform-rbac";

export type AppApiAuth =
  | { mode: "console"; userId: string }
  | { mode: "bearer"; appId: string; appUserId: string | null; credentialId: string };

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

export async function requireConsoleOrAppBearer(
  req: Request,
  options: {
    appId: string;
    consoleScope: string;
    bearerScope: string;
    targetUserId?: string;
  },
): Promise<{ ok: true; auth: AppApiAuth } | { ok: false; response: Response }> {
  const token = bearerToken(req);
  if (token) {
    const access = await findOAuthAccessToken(token);
    if (!access || access.revokedAt || new Date(access.expiresAt).getTime() <= Date.now()) {
      return {
        ok: false,
        response: problem(401, "Unauthorized", "Access token is invalid or expired", {
          errors: [{ field: "_auth", code: ErrorCodes.INVALID_CLIENT, message: "Access token is invalid or expired" }],
        }),
      };
    }

    if (access.appId !== options.appId) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Token is not valid for this application", {
          errors: [{ field: "_auth", code: ErrorCodes.PERMISSION_DENIED, message: "Token is not valid for this application" }],
        }),
      };
    }

    const scopes = parseScopeSet(access.scope);
    if (!scopes.has(options.bearerScope)) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Token does not grant the required scope", {
          errors: [{ field: "_auth", code: ErrorCodes.INVALID_SCOPE, message: `Scope ${options.bearerScope} is required` }],
        }),
      };
    }

    if (access.appUserId && options.targetUserId && access.appUserId !== options.targetUserId) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Token cannot access another user", {
          errors: [{ field: "userId", code: ErrorCodes.PERMISSION_DENIED, message: "Token cannot access another user" }],
        }),
      };
    }

    return {
      ok: true,
      auth: {
        mode: "bearer",
        appId: access.appId,
        appUserId: access.appUserId,
        credentialId: access.appCredentialId,
      },
    };
  }

  const consoleAuth = await requireScope(req, options.consoleScope);
  if (!consoleAuth.ok) return consoleAuth;
  return { ok: true, auth: { mode: "console", userId: consoleAuth.userId } };
}
