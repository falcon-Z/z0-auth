import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";

import { getDb } from "./db";
import { listUserTenants, resolveActiveTenant } from "./tenant";
import { userHasPermission } from "./permissions";

async function countTenantMembers(tenantId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM tenant_memberships
    WHERE tenant_id = ${tenantId}
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function countPendingInvites(tenantId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM tenant_invites
    WHERE tenant_id = ${tenantId}
      AND status = 'pending'
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function countTenants(): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count FROM tenants
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function countPlatformUsers(): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count FROM users
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function countActiveSessions(userId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM sessions
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

export async function buildConsoleSummary(userId: string): Promise<ConsoleSummaryResponse> {
  const organizations = await listUserTenants(userId);
  const activeTenant = await resolveActiveTenant(userId);
  const sessions = { activeCount: await countActiveSessions(userId) };

  const summary: ConsoleSummaryResponse = {
    membership: { tenantCount: organizations.length },
    sessions,
  };

  const canReadPlatformUsers = await userHasPermission(userId, "platform:users:read");
  const canReadPlatformTenants = await userHasPermission(userId, "platform:tenants:read");
  if (canReadPlatformUsers || canReadPlatformTenants) {
    summary.platform = {
      ...(canReadPlatformUsers ? { userCount: await countPlatformUsers() } : {}),
      ...(canReadPlatformTenants ? { tenantCount: await countTenants() } : {}),
    };
  }

  if (activeTenant && (await userHasPermission(userId, "users:read", activeTenant.id))) {
    const canInvite = await userHasPermission(userId, "users:invite", activeTenant.id);
    summary.tenant = {
      id: activeTenant.id,
      name: activeTenant.name,
      memberCount: await countTenantMembers(activeTenant.id),
      pendingInviteCount: canInvite ? await countPendingInvites(activeTenant.id) : 0,
    };
  }

  return summary;
}
