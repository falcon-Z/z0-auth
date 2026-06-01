import type { CreateInviteRequest } from "@z0/contracts/invites";
import type { CreateTenantRequest } from "@z0/contracts/tenants";
import { parseJsonBody } from "@z0/contracts/validation";

import { requireSession } from "../../lib/auth";
import { json, problem } from "../../lib/http";
import { requirePlatformPermission } from "../../lib/permissions";
import { createOrganization, listTenantsForUser } from "../../lib/tenants-mgmt";
import {
  createTenantInvite,
  listPendingInvites,
  listTenantMembers,
  removeTenantMember,
  revokeTenantInvite,
  updateMemberRoles,
} from "../../lib/invites";
import { requirePermission, userHasPermission } from "../../lib/permissions";
import type { RoutedRequest } from "../../lib/path-router";
import { getTenantForMember } from "../../lib/tenant";
import { ErrorCodes } from "@z0/contracts/errors";

function tenantIdFrom(req: RoutedRequest): string {
  return req.pathParams?.tenantId ?? "";
}

export async function handleListTenants(req: RoutedRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const tenants = await listTenantsForUser(auth.userId);
  return json({ tenants });
}

export async function handleCreateTenant(req: RoutedRequest): Promise<Response> {
  const perm = await requirePlatformPermission(req, "tenants:create");
  if (!perm.ok) return perm.response;

  const parsed = await parseJsonBody<CreateTenantRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createOrganization(perm.userId, parsed.body);
  if (!result.ok) return result.response;
  return json({ tenant: result.tenant }, { status: 201 });
}

async function canReadTenantMembers(userId: string, tenantId: string): Promise<boolean> {
  if (await userHasPermission(userId, "platform:manage")) return true;
  if (!(await getTenantForMember(userId, tenantId))) return false;
  return userHasPermission(userId, "users:read", tenantId);
}

export async function handleListMembers(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  if (!(await canReadTenantMembers(auth.userId, tenantId))) {
    return problem(403, "Forbidden", "You do not have permission to view members", {
      errors: [
        {
          field: "_auth",
          code: ErrorCodes.PERMISSION_DENIED,
          message: "You do not have permission to view members",
        },
      ],
    });
  }

  const members = await listTenantMembers(tenantId);
  return json({ members });
}

export async function handleListInvites(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const perm = await requirePermission(req, "users:invite", tenantId);
  if (!perm.ok) return perm.response;

  const invites = await listPendingInvites(tenantId);
  return json({ invites });
}

export async function handleCreateInvite(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const perm = await requirePermission(req, "users:invite", tenantId);
  if (!perm.ok) return perm.response;

  const parsed = await parseJsonBody<CreateInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createTenantInvite(req, tenantId, perm.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.data, { status: 201 });
}

export async function handleRevokeInvite(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const inviteId = req.pathParams?.inviteId ?? "";
  const perm = await requirePermission(req, "users:invite", tenantId);
  if (!perm.ok) return perm.response;

  const result = await revokeTenantInvite(tenantId, inviteId, perm.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleUpdateMemberRoles(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const userId = req.pathParams?.userId ?? "";
  const perm = await requirePermission(req, "users:invite", tenantId);
  if (!perm.ok) return perm.response;

  const parsed = await parseJsonBody<{ roleKeys: string[] }>(req);
  if (!parsed.ok) return parsed.response;

  const result = await updateMemberRoles(tenantId, userId, parsed.body.roleKeys ?? [], perm.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleRemoveMember(req: RoutedRequest): Promise<Response> {
  const tenantId = tenantIdFrom(req);
  const userId = req.pathParams?.userId ?? "";
  const perm = await requirePermission(req, "users:invite", tenantId);
  if (!perm.ok) return perm.response;

  const result = await removeTenantMember(tenantId, userId, perm.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
