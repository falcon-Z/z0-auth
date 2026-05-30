import type { BunRequest } from "bun";

import type { ChangePasswordRequest, LoginRequest, SetActiveTenantRequest } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";

import { buildSessionResponse, requireSession } from "../lib/auth";
import { validateCsrf, parseCookies } from "../lib/csrf";
import { json, problem } from "../lib/http";
import { buildAuthenticatedSessionPayload } from "../lib/session-payload";
import {
  clearSessionCookieHeader,
  revokeSessionByToken,
  SESSION_COOKIE,
} from "../lib/session";
import { setActiveTenant } from "../lib/tenant";
import { changePassword } from "../lib/users";
import { runLogin } from "./service";

export async function handleLogin(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<LoginRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await runLogin(req, parsed.body.email, parsed.body.password ?? "");
  if (!result.ok) return result.response;

  const payload = await buildAuthenticatedSessionPayload(result.userId);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.set("Set-Cookie", result.setCookie);

  return new Response(JSON.stringify(payload), { status: 200, headers });
}

export async function handleLogout(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const token = parseCookies(req).get(SESSION_COOKIE);
  if (token) await revokeSessionByToken(token);

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", clearSessionCookieHeader());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function handleSession(req: BunRequest): Promise<Response> {
  const session = await buildSessionResponse(req);
  return json(session);
}

export async function handleSetActiveTenant(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<SetActiveTenantRequest>(req);
  if (!parsed.ok) return parsed.response;

  const tenantId = parsed.body.tenantId?.trim() ?? "";
  if (!tenantId) {
    return problem(400, "Validation Error", "Invalid request", {
      errors: [{ field: "tenantId", code: ErrorCodes.REQUIRED, message: "Organization is required" }],
    });
  }

  const updated = await setActiveTenant(auth.userId, tenantId);
  if (!updated) {
    return problem(403, "Forbidden", "You do not have access to this organization", {
      errors: [
        {
          field: "tenantId",
          code: ErrorCodes.TENANT_ACCESS_DENIED,
          message: "You do not have access to this organization",
        },
      ],
    });
  }

  const payload = await buildAuthenticatedSessionPayload(auth.userId);
  return json(payload);
}

export async function handlePasswordResetUnavailable(): Promise<Response> {
  return problem(
    503,
    "Service Unavailable",
    "Password reset is not available until email (SMTP) is configured.",
    {
      errors: [
        {
          field: "_reset",
          code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE,
          message: "Password reset is not available until email (SMTP) is configured.",
        },
      ],
    },
  );
}

export async function handleRegister(): Promise<Response> {
  return problem(403, "Forbidden", "Platform registration is disabled.");
}

export async function handleChangePassword(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<ChangePasswordRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await changePassword(req, auth.userId, auth.sessionId, parsed.body);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
