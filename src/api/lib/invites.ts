import type { BunRequest } from "bun";
import type { SQL } from "bun";

import type {
  AcceptInviteRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  InvitePreviewResponse,
  PendingInvite,
  TenantMember,
} from "@z0/contracts/invites";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { getUserById } from "./auth";
import { writeAuditEvent } from "./audit";
import { sha256Hex, randomToken } from "./crypto";
import { getDb } from "./db";
import { problem } from "./http";
import { hashPassword } from "./password";
import { resolveSession } from "./session";
import { assignTenantRole } from "./roles";
import { getTenantForMember } from "./tenant";
import { createSession, sessionCookieHeader } from "./session";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteRow = {
  id: string;
  tenant_id: string;
  email: string;
  invited_name: string;
  role_keys: string[];
  token_hash: string;
  status: string;
  invited_by_user_id: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  declined_at: Date | null;
  created_at: Date;
};

function inviteStatus(row: InviteRow): InvitePreviewResponse["status"] {
  if (row.status === "pending" && row.expires_at.getTime() < Date.now()) return "expired";
  return row.status as InvitePreviewResponse["status"];
}

function primaryMembershipRole(roleKeys: string[]): string {
  if (roleKeys.includes("tenant_admin")) return "tenant_admin";
  if (roleKeys.includes("tenant_manager")) return "tenant_manager";
  return "tenant_member";
}

export function inviteUrlFromRequest(req: Request, rawToken: string): string {
  const origin = new URL(req.url).origin;
  return `${origin}/auth/invite/${rawToken}`;
}

async function findInviteByToken(rawToken: string): Promise<(InviteRow & { tenant_name: string; tenant_slug: string }) | null> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    SELECT
      i.id,
      i.tenant_id,
      i.email,
      i.invited_name,
      i.role_keys,
      i.token_hash,
      i.status,
      i.invited_by_user_id,
      i.expires_at,
      i.accepted_at,
      i.declined_at,
      i.created_at,
      t.name AS tenant_name,
      t.slug AS tenant_slug
    FROM tenant_invites i
    JOIN tenants t ON t.id = i.tenant_id
    WHERE i.token_hash = ${tokenHash}
  `;
  if (!row) return null;
  const r = row as InviteRow & { tenant_name: string; tenant_slug: string };
  return {
    ...r,
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    role_keys: Array.isArray(r.role_keys) ? r.role_keys.map(String) : [],
    expires_at: new Date(r.expires_at),
    accepted_at: r.accepted_at ? new Date(r.accepted_at) : null,
    declined_at: r.declined_at ? new Date(r.declined_at) : null,
    created_at: new Date(r.created_at),
  };
}

async function userExistsByEmail(email: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT id FROM users WHERE lower(email) = ${email} AND status = 'active'
  `;
  return Boolean(row);
}

export async function buildInvitePreview(req: Request, rawToken: string): Promise<InvitePreviewResponse | Response> {
  const invite = await findInviteByToken(rawToken);
  if (!invite) {
    return problem(404, "Not Found", "This invitation is not valid.", {
      errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation not found" }],
    });
  }

  const status = inviteStatus(invite);
  const session = await resolveSession(req);
  const sessionUser = session ? await getUserById(session.userId) : null;
  const emailMatches = Boolean(sessionUser && normalizeEmail(sessionUser.email) === invite.email);

  return {
    status,
    email: invite.email,
    invitedName: invite.invited_name,
    organization: {
      id: invite.tenant_id,
      name: invite.tenant_name,
      slug: invite.tenant_slug,
    },
    expiresAt: invite.expires_at.toISOString(),
    accountExists: await userExistsByEmail(invite.email),
    viewer: {
      authenticated: Boolean(sessionUser),
      emailMatches,
      email: sessionUser?.email,
    },
  };
}

export async function validateTenantRoleKeys(roleKeys: string[]): Promise<{ field: string; code: string; message: string }[]> {
  const errors: { field: string; code: string; message: string }[] = [];
  if (!roleKeys.length) {
    errors.push({ field: "roleKeys", code: ErrorCodes.REQUIRED, message: "Select at least one role" });
    return errors;
  }

  const rows = await getDb()`
    SELECT key FROM roles WHERE scope = 'tenant' AND key IN ${roleKeys}
  `;
  const valid = new Set(rows.map((r) => String((r as { key: string }).key)));
  for (const key of roleKeys) {
    if (!valid.has(key)) {
      errors.push({ field: "roleKeys", code: ErrorCodes.INVALID_ROLE, message: `Unknown role: ${key}` });
    }
  }
  return errors;
}

export async function createTenantInvite(
  req: BunRequest,
  tenantId: string,
  invitedByUserId: string,
  body: CreateInviteRequest,
): Promise<{ ok: true; data: CreateInviteResponse } | { ok: false; response: Response }> {
  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.invitedName, "invitedName", "Name"),
    ...(await validateTenantRoleKeys(body.roleKeys ?? [])),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid invite request", { errors }) };
  }

  const email = normalizeEmail(body.email);
  const invitedName = body.invitedName.trim();
  const roleKeys = [...new Set(body.roleKeys)];

  const [userRow] = await getDb()`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
  if (userRow) {
    const userId = String((userRow as { id: string }).id);
    const member = await getTenantForMember(userId, tenantId);
    if (member) {
      return {
        ok: false,
        response: problem(409, "Conflict", "This person is already a member of the organization.", {
          errors: [
            {
              field: "email",
              code: ErrorCodes.INVITE_ALREADY_MEMBER,
              message: "Already a member of this organization",
            },
          ],
        }),
      };
    }
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  try {
    const [inserted] = await getDb()`
      INSERT INTO tenant_invites (
        tenant_id,
        email,
        invited_name,
        role_keys,
        token_hash,
        invited_by_user_id,
        expires_at
      )
      VALUES (
        ${tenantId},
        ${email},
        ${invitedName},
        ${roleKeys},
        ${tokenHash},
        ${invitedByUserId},
        ${expiresAt}
      )
      RETURNING id
    `;

    const id = String((inserted as { id: string }).id);
    await writeAuditEvent({
      tenantId,
      actorUserId: invitedByUserId,
      action: "invite.created",
      resourceType: "tenant_invite",
      resourceId: id,
      payload: { email, roleKeys },
    });

    return {
      ok: true,
      data: {
        id,
        inviteUrl: inviteUrlFromRequest(req, rawToken),
        expiresAt: expiresAt.toISOString(),
        email,
        invitedName,
        roleKeys,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "A pending invitation already exists for this email.", {
          errors: [{ field: "email", code: ErrorCodes.INVITE_INVALID, message: "Pending invite already exists" }],
        }),
      };
    }
    throw error;
  }
}

async function applyInviteMembership(
  tx: SQL,
  invite: InviteRow & { tenant_name: string; tenant_slug: string },
  userId: string,
): Promise<void> {
  const membershipRole = primaryMembershipRole(invite.role_keys);
  await tx`
    INSERT INTO tenant_memberships (user_id, tenant_id, role)
    VALUES (${userId}, ${invite.tenant_id}, ${membershipRole})
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = ${membershipRole}
  `;
  for (const roleKey of invite.role_keys) {
    await assignTenantRole(userId, invite.tenant_id, roleKey, tx);
  }
  await tx`
    UPDATE tenant_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = ${invite.id}
  `;
}

export async function acceptTenantInvite(
  req: BunRequest,
  rawToken: string,
  body: AcceptInviteRequest,
): Promise<
  | { ok: true; userId: string; tenantId: string; setCookie?: string }
  | { ok: false; response: Response }
> {
  const invite = await findInviteByToken(rawToken);
  if (!invite) {
    return {
      ok: false,
      response: problem(404, "Not Found", "This invitation is not valid.", {
        errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation not found" }],
      }),
    };
  }

  const status = inviteStatus(invite);
  if (status !== "pending") {
    return {
      ok: false,
      response: problem(409, "Conflict", "This invitation is no longer available.", {
        errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation is not pending" }],
      }),
    };
  }

  const accountExists = await userExistsByEmail(invite.email);
  const session = await resolveSession(req);

  if (accountExists) {
    if (!session) {
      return {
        ok: false,
        response: problem(401, "Unauthorized", "Sign in to accept this invitation.", {
          code: "AuthenticationRequired",
        }),
      };
    }
    const user = await getUserById(session.userId);
    if (!user || normalizeEmail(user.email) !== invite.email) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Sign in with the email address that received this invitation.", {
          errors: [
            {
              field: "_auth",
              code: ErrorCodes.INVITE_EMAIL_MISMATCH,
              message: "Signed-in account does not match this invitation",
            },
          ],
        }),
      };
    }

    const userId = user.id;
    const existing = await getTenantForMember(userId, invite.tenant_id);
    if (existing) {
      return {
        ok: false,
        response: problem(409, "Conflict", "You are already a member of this organization.", {
          errors: [
            {
              field: "_invite",
              code: ErrorCodes.INVITE_ALREADY_MEMBER,
              message: "Already a member",
            },
          ],
        }),
      };
    }

    await getDb().begin(async (tx) => {
      await applyInviteMembership(tx, invite, userId);
      await writeAuditEvent(
        {
          tenantId: invite.tenant_id,
          actorUserId: userId,
          action: "invite.accepted",
          resourceType: "tenant_invite",
          resourceId: invite.id,
          payload: { email: invite.email },
        },
        tx,
      );
    });

    return { ok: true, userId, tenantId: invite.tenant_id };
  }

  const name = (body.name?.trim() || invite.invited_name).trim();
  const errors = [
    ...validateRequiredString(name, "name", "Name"),
    ...validatePassword(body.password ?? "", { email: invite.email, name }),
    ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid accept request", { errors }) };
  }

  const passwordHash = await hashPassword(body.password!);

  try {
    const result = await getDb().begin(async (tx) => {
      const [user] = await tx`
        INSERT INTO users (email, name, email_verified_at)
        VALUES (${invite.email}, ${name}, NOW())
        RETURNING id
      `;
      const userId = String((user as { id: string }).id);
      await tx`
        INSERT INTO password_credentials (user_id, password_hash)
        VALUES (${userId}, ${passwordHash})
      `;
      await applyInviteMembership(tx, invite, userId);
      await tx`
        INSERT INTO user_preferences (user_id, active_tenant_id)
        VALUES (${userId}, ${invite.tenant_id})
        ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = ${invite.tenant_id}, updated_at = NOW()
      `;
      await writeAuditEvent(
        {
          tenantId: invite.tenant_id,
          actorUserId: userId,
          action: "invite.accepted",
          resourceType: "tenant_invite",
          resourceId: invite.id,
          payload: { email: invite.email, createdUser: true },
        },
        tx,
      );
      return userId;
    });

    const { token, expiresAt } = await createSession(result, req);
    return {
      ok: true,
      userId: result,
      tenantId: invite.tenant_id,
      setCookie: sessionCookieHeader(token, expiresAt),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "An account with this email already exists. Sign in to accept the invitation.", {
          errors: [{ field: "email", code: ErrorCodes.INVITE_ALREADY_MEMBER, message: "Account already exists" }],
        }),
      };
    }
    throw error;
  }
}

export async function declineTenantInvite(
  req: BunRequest,
  rawToken: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const invite = await findInviteByToken(rawToken);
  if (!invite) {
    return {
      ok: false,
      response: problem(404, "Not Found", "This invitation is not valid.", {
        errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation not found" }],
      }),
    };
  }

  const status = inviteStatus(invite);
  if (status !== "pending") {
    return {
      ok: false,
      response: problem(409, "Conflict", "This invitation is no longer available.", {
        errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation is not pending" }],
      }),
    };
  }

  const accountExists = await userExistsByEmail(invite.email);
  const session = await resolveSession(req);

  if (accountExists) {
    if (!session) {
      return {
        ok: false,
        response: problem(401, "Unauthorized", "Sign in to decline this invitation.", {
          code: "AuthenticationRequired",
        }),
      };
    }
    const user = await getUserById(session.userId);
    if (!user || normalizeEmail(user.email) !== invite.email) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Sign in with the email address that received this invitation.", {
          errors: [
            {
              field: "_auth",
              code: ErrorCodes.INVITE_EMAIL_MISMATCH,
              message: "Signed-in account does not match this invitation",
            },
          ],
        }),
      };
    }
  }

  await getDb()`
    UPDATE tenant_invites
    SET status = 'declined', declined_at = NOW()
    WHERE id = ${invite.id}
  `;

  await writeAuditEvent({
    tenantId: invite.tenant_id,
    actorUserId: session?.userId ?? null,
    action: "invite.declined",
    resourceType: "tenant_invite",
    resourceId: invite.id,
    payload: { email: invite.email },
  });

  return { ok: true };
}

export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const rows = await getDb()`
    SELECT
      u.id,
      u.email,
      u.name,
      tm.created_at,
      COALESCE(
        array_agg(DISTINCT r.key) FILTER (WHERE r.scope = 'tenant' AND ur.tenant_id = ${tenantId}),
        '{}'
      ) AS role_keys
    FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = ${tenantId}
    LEFT JOIN roles r ON r.id = ur.role_id AND r.scope = 'tenant'
    WHERE tm.tenant_id = ${tenantId}
    GROUP BY u.id, u.email, u.name, tm.created_at
    ORDER BY u.name ASC
  `;

  return rows.map((row) => {
    const r = row as { id: string; email: string; name: string; created_at: Date; role_keys: string[] };
    const keys = Array.isArray(r.role_keys) ? r.role_keys.filter(Boolean) : [];
    return {
      userId: String(r.id),
      email: r.email,
      name: r.name,
      roleKeys: keys.length ? keys : ["tenant_member"],
      joinedAt: new Date(r.created_at).toISOString(),
    };
  });
}

export async function listPendingInvites(tenantId: string): Promise<PendingInvite[]> {
  const rows = await getDb()`
    SELECT id, email, invited_name, role_keys, expires_at, created_at
    FROM tenant_invites
    WHERE tenant_id = ${tenantId}
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  return rows.map((row) => {
    const r = row as {
      id: string;
      email: string;
      invited_name: string;
      role_keys: string[];
      expires_at: Date;
      created_at: Date;
    };
    return {
      id: String(r.id),
      email: r.email,
      invitedName: r.invited_name,
      roleKeys: Array.isArray(r.role_keys) ? r.role_keys.map(String) : [],
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

export async function revokeTenantInvite(
  tenantId: string,
  inviteId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const [row] = await getDb()`
    UPDATE tenant_invites
    SET status = 'revoked'
    WHERE id = ${inviteId}
      AND tenant_id = ${tenantId}
      AND status = 'pending'
    RETURNING id
  `;
  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Invitation not found", {
        errors: [{ field: "inviteId", code: ErrorCodes.INVITE_INVALID, message: "Invitation not found" }],
      }),
    };
  }

  await writeAuditEvent({
    tenantId,
    actorUserId,
    action: "invite.revoked",
    resourceType: "tenant_invite",
    resourceId: inviteId,
  });

  return { ok: true };
}

export async function updateMemberRoles(
  tenantId: string,
  targetUserId: string,
  roleKeys: string[],
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const roleErrors = await validateTenantRoleKeys(roleKeys);
  if (roleErrors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid roles", { errors: roleErrors }) };
  }

  const member = await getTenantForMember(targetUserId, tenantId);
  if (!member) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Member not found", {
        errors: [{ field: "userId", code: ErrorCodes.INVITE_INVALID, message: "Not a member" }],
      }),
    };
  }

  const keys = [...new Set(roleKeys)];
  const membershipRole = primaryMembershipRole(keys);

  await getDb().begin(async (tx) => {
    await tx`
      DELETE FROM user_roles ur
      USING roles r
      WHERE ur.user_id = ${targetUserId}
        AND ur.tenant_id = ${tenantId}
        AND ur.role_id = r.id
        AND r.scope = 'tenant'
    `;
    for (const roleKey of keys) {
      await assignTenantRole(targetUserId, tenantId, roleKey, tx);
    }
    await tx`
      UPDATE tenant_memberships
      SET role = ${membershipRole}
      WHERE user_id = ${targetUserId} AND tenant_id = ${tenantId}
    `;
    await writeAuditEvent(
      {
        tenantId,
        actorUserId,
        action: "member.roles_updated",
        resourceType: "user",
        resourceId: targetUserId,
        payload: { roleKeys: keys },
      },
      tx,
    );
  });

  return { ok: true };
}

export async function removeTenantMember(
  tenantId: string,
  targetUserId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const member = await getTenantForMember(targetUserId, tenantId);
  if (!member) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Member not found", {
        errors: [{ field: "userId", code: ErrorCodes.INVITE_INVALID, message: "Not a member" }],
      }),
    };
  }

  await getDb().begin(async (tx) => {
    await tx`
      DELETE FROM user_roles
      WHERE user_id = ${targetUserId} AND tenant_id = ${tenantId}
    `;
    await tx`
      DELETE FROM tenant_memberships
      WHERE user_id = ${targetUserId} AND tenant_id = ${tenantId}
    `;
    await writeAuditEvent(
      {
        tenantId,
        actorUserId,
        action: "member.removed",
        resourceType: "user",
        resourceId: targetUserId,
      },
      tx,
    );
  });

  return { ok: true };
}

export async function listTenantRoles(): Promise<{ key: string; scope: string; description: string }[]> {
  const rows = await getDb()`
    SELECT key, scope, description
    FROM roles
    WHERE scope = 'tenant'
    ORDER BY key ASC
  `;
  return rows.map((row) => ({
    key: String((row as { key: string }).key),
    scope: String((row as { scope: string }).scope),
    description: String((row as { description: string }).description),
  }));
}
