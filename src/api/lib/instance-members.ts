import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";

import { requireSession } from "./auth";
import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";

export type InstanceMemberRow = {
  userId: string;
  email: string;
  name: string;
  joinedAt: string;
  isBootstrap: boolean;
};

export async function isInstanceMember(userId: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1 FROM instance_members WHERE user_id = ${userId} LIMIT 1
  `;
  return Boolean(row);
}

export async function requireInstanceMember(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth;

  if (!(await isInstanceMember(auth.userId))) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You do not have access to the console", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Not an instance member",
          },
        ],
      }),
    };
  }

  return { ok: true, userId: auth.userId };
}

export async function listInstanceMembers(): Promise<InstanceMemberRow[]> {
  const rows = await getDb()`
    SELECT
      u.id,
      u.email,
      u.name,
      m.joined_at,
      m.is_bootstrap
    FROM instance_members m
    JOIN users u ON u.id = m.user_id
    WHERE u.status = 'active'
    ORDER BY u.name ASC
  `;

  return rows.map((row) => {
    const r = row as {
      id: string;
      email: string;
      name: string;
      joined_at: Date;
      is_bootstrap: boolean;
    };
    return {
      userId: String(r.id),
      email: r.email,
      name: r.name,
      joinedAt: new Date(r.joined_at).toISOString(),
      isBootstrap: Boolean(r.is_bootstrap),
    };
  });
}

export async function removeInstanceMember(
  targetUserId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const result = await getDb().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7130011)`;

    const [member] = await tx`
      SELECT is_bootstrap FROM instance_members WHERE user_id = ${targetUserId} FOR UPDATE
    `;
    if (!member) {
      return { error: "not_found" as const };
    }

    const [countRow] = await tx`
      SELECT COUNT(*)::int AS n
      FROM instance_members m
      JOIN users u ON u.id = m.user_id AND u.status = 'active'
    `;
    if (Number((countRow as { n: number }).n) <= 1) {
      return { error: "last_member" as const };
    }

    await tx`DELETE FROM instance_members WHERE user_id = ${targetUserId}`;
    await writeAuditEvent(
      {
        actorUserId,
        action: "member.removed",
        resourceType: "instance_member",
        resourceId: targetUserId,
      },
      tx,
    );
    return { error: null };
  });

  if (result.error === "not_found") {
    return {
      ok: false,
      response: problem(404, "Not Found", "Member not found", {
        errors: [{ field: "userId", code: ErrorCodes.USER_NOT_FOUND, message: "Not a member" }],
      }),
    };
  }
  if (result.error === "last_member") {
    return {
      ok: false,
      response: problem(409, "Conflict", "Cannot remove the last instance member", {
        errors: [
          {
            field: "userId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "At least one member is required",
          },
        ],
      }),
    };
  }

  return { ok: true };
}
