import type { CreateInviteRequest } from "@z0/contracts/invites";
import { parseJsonBody } from "@z0/contracts/validation";
import { ErrorCodes } from "@z0/contracts/errors";

import { json, problem } from "../../lib/http";
import { validateCsrf } from "../../lib/csrf";
import {
  createInstanceInvite,
  listInstanceMembersForApi,
  listPendingInstanceInvites,
  revokeInstanceInvite,
} from "../../lib/invites";
import { removeInstanceMember } from "../../lib/instance-members";
import { transitionInstanceMember } from "../../lib/member-lifecycle";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { issueConsoleAdminReset } from "../../lib/admin-reset";
import { requireRecentConsoleMfa, resetConsoleMfaForAdmin } from "../../lib/mfa";

export async function handleListMembers(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "members:read");
  if (!auth.ok) return auth.response;

  const rawStatus = new URL(req.url).searchParams.get("status") ?? undefined;
  if (rawStatus && rawStatus !== "active" && rawStatus !== "disabled" && rawStatus !== "locked" && rawStatus !== "deleted") {
    return problem(400, "Validation Error", "Invalid account status filter.", {
      errors: [{ field: "status", code: ErrorCodes.REQUIRED, message: "Status must be active, disabled, locked, or deleted" }],
    });
  }
  const members = await listInstanceMembersForApi(rawStatus);
  return json({ members });
}

export async function handleListInvites(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "members:read");
  if (!auth.ok) return auth.response;

  const invites = await listPendingInstanceInvites();
  return json({ invites });
}

export async function handleCreateInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "members:invite");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createInstanceInvite(req, auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.data, { status: 201 });
}

export async function handleRevokeInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const inviteId = req.pathParams?.inviteId ?? "";
  const auth = await requireScope(req, "members:invite");
  if (!auth.ok) return auth.response;

  const result = await revokeInstanceInvite(inviteId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleRemoveMember(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const userId = req.pathParams?.userId ?? "";
  const auth = await requireScope(req, "members:remove");
  if (!auth.ok) return auth.response;

  const result = await removeInstanceMember(userId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleMemberLifecycle(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const userId = req.pathParams?.userId ?? "";
  const action = req.pathParams?.action ?? "";
  if (action !== "disable" && action !== "enable" && action !== "unlock" && action !== "delete" && action !== "restore" && action !== "permanently-delete") {
    return new Response("Not found", { status: 404 });
  }
  const auth = await requireScope(req, "members:remove");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;
  const body = await req.json().catch(() => ({})) as { confirmationEmail?: string };
  const result = await transitionInstanceMember(userId, auth.userId, action, body.confirmationEmail);
  if (!result.ok) return result.response;
  return json({ ok: true, permanentlyDeleted: result.permanentlyDeleted });
}

export async function handleMemberAdminReset(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const userId = req.pathParams?.userId ?? "";
  const auth = await requireScope(req, "members:remove");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;
  const result = await issueConsoleAdminReset(req, userId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleMemberMfaReset(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const auth = await requireScope(req, "members:remove");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;
  const result = await resetConsoleMfaForAdmin(req.pathParams?.userId ?? "", auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
