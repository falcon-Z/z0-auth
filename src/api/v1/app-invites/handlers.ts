import type { AcceptAppUserInviteRequest } from "@z0/contracts/app-users";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  acceptAppUserInvite,
  buildAppUserInvitePreview,
  declineAppUserInvite,
} from "../../lib/app-users";
import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import type { RoutedRequest } from "../../lib/path-router";

function tokenFrom(req: RoutedRequest): string {
  return req.pathParams?.token ?? "";
}

export async function handleAppUserInvitePreview(req: RoutedRequest): Promise<Response> {
  const result = await buildAppUserInvitePreview(req, tokenFrom(req));
  if (result instanceof Response) return result;
  return json(result);
}

export async function handleAcceptAppUserInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<AcceptAppUserInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await acceptAppUserInvite(req, tokenFrom(req), parsed.body);
  if (!result.ok) return result.response;

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (result.setCookie) headers.set("Set-Cookie", result.setCookie);

  return new Response(JSON.stringify({ ok: true, userId: result.userId }), { status: 200, headers });
}

export async function handleDeclineAppUserInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const result = await declineAppUserInvite(req, tokenFrom(req));
  if (!result.ok) return result.response;
  return json({ ok: true });
}
