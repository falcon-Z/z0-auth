import type { BunRequest } from "bun";

import type { LoginRequest } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";

import { buildSessionResponse, getUserById, getUserRoles } from "../lib/auth";
import { getUserDefaultTenant } from "../lib/tenant";
import { validateCsrf, parseCookies } from "../lib/csrf";
import { json, problem } from "../lib/http";
import {
  clearSessionCookieHeader,
  revokeSessionByToken,
  SESSION_COOKIE,
} from "../lib/session";
import { runLogin } from "./service";

export async function handleLogin(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<LoginRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await runLogin(req, parsed.body.email, parsed.body.password ?? "");
  if (!result.ok) return result.response;

  const sessionUser = await getUserById(result.userId);
  const roles = await getUserRoles(result.userId);
  const tenant = await getUserDefaultTenant(result.userId);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.set("Set-Cookie", result.setCookie);

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: sessionUser,
      roles,
      ...(tenant ? { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } } : {}),
    }),
    { status: 200, headers },
  );
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
