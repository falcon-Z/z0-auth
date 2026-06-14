import type { CreateInviteRequest } from "@z0/contracts/invites";
import { parseJsonBody } from "@z0/contracts/validation";

import { json, problem } from "../../lib/http";
import {
  createInstanceInvite,
  listInstanceMembersForApi,
  listPendingInstanceInvites,
  revokeInstanceInvite,
} from "../../lib/invites";
import { removeInstanceMember } from "../../lib/instance-members";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";

export async function handleListMembers(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "members:read");
  if (!auth.ok) return auth.response;

  const members = await listInstanceMembersForApi();
  return json({ members });
}

export async function handleListInvites(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "members:read");
  if (!auth.ok) return auth.response;

  const invites = await listPendingInstanceInvites();
  return json({ invites });
}

export async function handleCreateInvite(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "members:invite");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createInstanceInvite(req, auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.data, { status: 201 });
}

export async function handleRevokeInvite(req: RoutedRequest): Promise<Response> {
  const inviteId = req.pathParams?.inviteId ?? "";
  const auth = await requireScope(req, "members:invite");
  if (!auth.ok) return auth.response;

  const result = await revokeInstanceInvite(inviteId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleRemoveMember(req: RoutedRequest): Promise<Response> {
  const userId = req.pathParams?.userId ?? "";
  const auth = await requireScope(req, "members:remove");
  if (!auth.ok) return auth.response;

  const result = await removeInstanceMember(userId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
