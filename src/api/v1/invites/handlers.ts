import type { AcceptInviteRequest } from "@z0/contracts/invites";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import { acceptInstanceInvite, buildInvitePreview, declineInstanceInvite } from "../../lib/invites";
import type { RoutedRequest } from "../../lib/path-router";

function tokenFrom(req: RoutedRequest): string {
  return req.pathParams?.token ?? "";
}

export async function handleInvitePreview(req: RoutedRequest): Promise<Response> {
  const result = await buildInvitePreview(req, tokenFrom(req));
  if (result instanceof Response) return result;
  return json(result);
}

export async function handleAcceptInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<AcceptInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await acceptInstanceInvite(req, tokenFrom(req), parsed.body);
  if (!result.ok) return result.response;

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (result.setCookie) headers.set("Set-Cookie", result.setCookie);

  return new Response(JSON.stringify({ ok: true, userId: result.userId }), { status: 200, headers });
}

export async function handleDeclineInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const result = await declineInstanceInvite(req, tokenFrom(req));
  if (!result.ok) return result.response;
  return json({ ok: true });
}
