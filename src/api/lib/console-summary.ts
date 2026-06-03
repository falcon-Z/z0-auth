import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";

import { getDb } from "./db";
import { getInstanceSettings } from "./instance";

async function countInstanceMembers(): Promise<number> {
  const [row] = await getDb()`SELECT COUNT(*)::int AS count FROM instance_members`;
  return Number((row as { count: number }).count ?? 0);
}

async function countPendingInvites(): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM instance_invites
    WHERE status = 'pending'
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function countUsers(): Promise<number> {
  const [row] = await getDb()`SELECT COUNT(*)::int AS count FROM users`;
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

export async function buildConsoleSummary(_userId: string): Promise<ConsoleSummaryResponse> {
  const settings = await getInstanceSettings();

  return {
    instance: {
      organizationName: settings.organizationName,
      memberCount: await countInstanceMembers(),
      pendingInviteCount: await countPendingInvites(),
      userCount: await countUsers(),
    },
    sessions: {
      activeCount: await countActiveSessions(_userId),
    },
  };
}
