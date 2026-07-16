import type { BunRequest } from "bun";

import type {
  PasskeyAuthenticationOptionsRequest,
  PasskeyAuthenticationVerifyRequest,
  PasskeyDeleteRequest,
  PasskeyRegistrationVerifyRequest,
  PasskeyRenameRequest,
} from "@z0/contracts/passkeys";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";
import { requireSession } from "../lib/auth";
import { resolveAppSessionForApp } from "../lib/app-session";
import { findAppByClientId } from "../lib/auth-realm";
import { validateCsrf } from "../lib/csrf";
import { json, problem } from "../lib/http";
import {
  clearPasskeyCeremonyCookieHeader,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  listPasskeys,
  removePasskey,
  requireFreshPasskeyChange,
  renamePasskey,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "../lib/passkeys";

type Context =
  | { realm: "console"; userId: string; sessionId: string }
  | { realm: "app"; appUserId: string; appId: string; sessionId: string; clientId: string };

function noStoreJson(data: unknown, init?: { status?: number; setCookies?: string[] }): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const cookie of init?.setCookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status: init?.status ?? 200, headers });
}

async function authenticatedContext(req: BunRequest, clientId?: string): Promise<{ ok: true; context: Context } | { ok: false; response: Response }> {
  if (clientId?.trim()) {
    const app = await findAppByClientId(clientId.trim());
    if (!app) return { ok: false, response: problem(404, "Not Found", "Application not found.") };
    if (app.app_status !== "active") return { ok: false, response: problem(403, "Forbidden", "Application sign-in is unavailable.") };
    const session = await resolveAppSessionForApp(req, app.app_id);
    if (!session) return { ok: false, response: problem(401, "Unauthorized", "Application sign-in required") };
    return { ok: true, context: { realm: "app", appUserId: session.appUserId, appId: app.app_id, sessionId: session.sessionId, clientId: app.client_id } };
  }
  const auth = await requireSession(req);
  if (!auth.ok) return auth;
  return { ok: true, context: { realm: "console", userId: auth.userId, sessionId: auth.sessionId } };
}

function serviceContext(context: Context) {
  return context.realm === "console"
    ? { realm: "console" as const, userId: context.userId }
    : { realm: "app" as const, appUserId: context.appUserId, appId: context.appId };
}

export async function handleListPasskeys(req: BunRequest): Promise<Response> {
  const clientId = new URL(req.url).searchParams.get("client_id") ?? undefined;
  const auth = await authenticatedContext(req, clientId);
  if (!auth.ok) return auth.response;
  return noStoreJson(await listPasskeys(serviceContext(auth.context)));
}

export async function handleStartPasskeyRegistration(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<{ clientId?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const auth = await authenticatedContext(req, parsed.body.clientId);
  if (!auth.ok) return auth.response;
  const result = await startPasskeyRegistration(req, serviceContext(auth.context), auth.context.sessionId);
  if (!result.ok) return result.response;
  return noStoreJson({ options: result.options }, { setCookies: [result.setCookie] });
}

export async function handleFinishPasskeyRegistration(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<PasskeyRegistrationVerifyRequest>(req);
  if (!parsed.ok) return parsed.response;
  if (!parsed.body.response || typeof parsed.body.response !== "object") {
    return problem(400, "Validation Error", "A passkey response is required.");
  }
  const auth = await authenticatedContext(req, parsed.body.clientId);
  if (!auth.ok) return auth.response;
  const result = await finishPasskeyRegistration(
    req,
    serviceContext(auth.context),
    auth.context.sessionId,
    parsed.body.response,
    parsed.body.label,
  );
  if (!result.ok) return result.response;
  return noStoreJson({ passkey: result.passkey }, { status: 201, setCookies: [clearPasskeyCeremonyCookieHeader()] });
}

export async function handleStartPasskeyAuthentication(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<PasskeyAuthenticationOptionsRequest>(req);
  if (!parsed.ok) return parsed.response;
  let realm: "console" | "app" = "console";
  let appId: string | undefined;
  let identityId: string | undefined;
  if (parsed.body.clientId?.trim()) {
    const app = await findAppByClientId(parsed.body.clientId.trim());
    if (!app) return problem(400, "Validation Error", "Application not found.");
    if (app.app_status !== "active") return problem(403, "Forbidden", "Application sign-in is unavailable.");
    realm = "app";
    appId = app.app_id;
  }
  if (parsed.body.stepUp) {
    const auth = await authenticatedContext(req, parsed.body.clientId);
    if (!auth.ok) return auth.response;
    realm = auth.context.realm;
    appId = auth.context.realm === "app" ? auth.context.appId : undefined;
    identityId = auth.context.realm === "console" ? auth.context.userId : auth.context.appUserId;
  }
  const result = await startPasskeyAuthentication(req, {
    realm,
    appId,
    identityId,
    email: parsed.body.email,
    purpose: parsed.body.stepUp ? "step_up" : "authentication",
    returnPath: parsed.body.returnTo,
  });
  if (!result.ok) return result.response;
  return noStoreJson({ options: result.options }, { setCookies: [result.setCookie] });
}

export async function handleFinishPasskeyAuthentication(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<PasskeyAuthenticationVerifyRequest>(req);
  if (!parsed.ok) return parsed.response;
  if (!parsed.body.response || typeof parsed.body.response !== "object") {
    return problem(400, "Validation Error", "A passkey response is required.");
  }
  const result = await finishPasskeyAuthentication(req, parsed.body.response);
  if (!result.ok) return result.response;
  const cookies = [clearPasskeyCeremonyCookieHeader()];
  if (result.setCookie) cookies.unshift(result.setCookie);
  return noStoreJson({ authenticated: true, returnPath: result.returnPath, stepUp: result.stepUp }, { setCookies: cookies });
}

export async function handleRenamePasskey(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<PasskeyRenameRequest>(req);
  if (!parsed.ok) return parsed.response;
  const auth = await authenticatedContext(req, parsed.body.clientId);
  if (!auth.ok) return auth.response;
  const result = await renamePasskey(serviceContext(auth.context), parsed.body.passkeyId ?? "", parsed.body.label ?? "");
  if (result instanceof Response) return result;
  if (!result) return problem(404, "Not Found", "Passkey not found.", { errors: [{ field: "passkeyId", code: ErrorCodes.PASSKEY_NOT_FOUND, message: "Passkey not found" }] });
  return json({ ok: true });
}

export async function handleRemovePasskey(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<PasskeyDeleteRequest>(req);
  if (!parsed.ok) return parsed.response;
  const auth = await authenticatedContext(req, parsed.body.clientId);
  if (!auth.ok) return auth.response;
  const freshError = await requireFreshPasskeyChange(serviceContext(auth.context), auth.context.sessionId);
  if (freshError) return freshError;
  const removed = await removePasskey(serviceContext(auth.context), parsed.body.passkeyId ?? "", auth.context.sessionId);
  if (!removed) return problem(404, "Not Found", "Passkey not found.", { errors: [{ field: "passkeyId", code: ErrorCodes.PASSKEY_NOT_FOUND, message: "Passkey not found" }] });
  return json({ ok: true });
}
