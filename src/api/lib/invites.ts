import type { BunRequest } from "bun";
import type { SQL } from "bun";

import type {
  AcceptInviteRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  InstanceMember,
  InvitePreviewResponse,
  PendingInvite,
  RoleSummary,
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
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { getInstanceSettings } from "./instance";
import { hashPassword } from "./password";
import {
  applyInviteRolesToMember,
  assignInviteRolesInTx,
  getDeveloperRoleId,
  grantBoundaryViolationForRoleIds,
} from "./platform-rbac";
import { memberInviteEmailText, sendTransactionalEmail } from "./transactional-email";
import { resolveSession } from "./session";
import { createSession, sessionCookieHeader, revokeAllUserSessions } from "./session";
import { requestPublicOrigin } from "./config";
import { accountStatus } from "./account-lifecycle";
import { createConsoleMfaChallenge, hasConsoleMfa } from "./mfa";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteRolesMissingResponse(): Response {
  return problem(409, "Conflict", "This invitation is missing role assignments.", {
    errors: [
      {
        field: "_invite",
        code: ErrorCodes.INVITE_INVALID,
        message: "Invitation roles are invalid",
      },
    ],
  });
}

export type InviteRow = {
  id: string;
  email: string;
  invited_name: string;
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

export function inviteUrlFromRequest(req: Request, rawToken: string): string {
  return `${requestPublicOrigin(req)}/auth/invite/${rawToken}`;
}

async function findInviteByToken(rawToken: string): Promise<InviteRow | null> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    SELECT
      id,
      email,
      invited_name,
      token_hash,
      status,
      invited_by_user_id,
      expires_at,
      accepted_at,
      declined_at,
      created_at
    FROM instance_invites
    WHERE token_hash = ${tokenHash}
  `;
  if (!row) return null;
  const r = row as InviteRow;
  return {
    ...r,
    id: String(r.id),
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

async function roleSummariesForInvite(inviteId: string, db: SQL = getDb()): Promise<RoleSummary[]> {
  const rows = await db`
    SELECT r.id, r.key, r.name
    FROM instance_invite_roles ir
    JOIN instance_roles r ON r.id = ir.role_id
    WHERE ir.invite_id = ${inviteId}
    ORDER BY r.name
  `;
  return rows.map((row) => {
    const r = row as { id: string; key: string; name: string };
    return { id: String(r.id), key: r.key, name: r.name };
  });
}

async function resolveInviteRoleIds(body: CreateInviteRequest): Promise<string[]> {
  if (body.roleIds && body.roleIds.length > 0) {
    return [...new Set(body.roleIds)];
  }
  return [await getDeveloperRoleId()];
}

async function isMemberByEmail(email: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM instance_members m
    JOIN users u ON u.id = m.user_id
    WHERE lower(u.email) = ${email}
    LIMIT 1
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

  const settings = await getInstanceSettings();
  const status = inviteStatus(invite);
  const session = await resolveSession(req);
  const sessionUser = session ? await getUserById(session.userId) : null;
  const emailMatches = Boolean(sessionUser && normalizeEmail(sessionUser.email) === invite.email);
  const hasAccount = await userExistsByEmail(invite.email);
  const isMember = hasAccount ? await isMemberByEmail(invite.email) : false;

  return {
    status,
    email: invite.email,
    invitedName: invite.invited_name,
    organizationName: settings.organizationName,
    expiresAt: invite.expires_at.toISOString(),
    accountExists: hasAccount && isMember,
    viewer: {
      authenticated: Boolean(sessionUser),
      emailMatches,
      email: sessionUser?.email,
    },
  };
}

export async function createInstanceInvite(
  req: BunRequest,
  invitedByUserId: string,
  body: CreateInviteRequest,
): Promise<{ ok: true; data: CreateInviteResponse } | { ok: false; response: Response }> {
  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.invitedName, "invitedName", "Name"),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid invite request", { errors }) };
  }

  const email = normalizeEmail(body.email);
  const invitedName = body.invitedName.trim();

  if (await isMemberByEmail(email)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "This person is already a member.", {
        errors: [
          {
            field: "email",
            code: ErrorCodes.INVITE_ALREADY_MEMBER,
            message: "Already a member",
          },
        ],
      }),
    };
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const roleIds = await resolveInviteRoleIds(body);

  const boundary = await grantBoundaryViolationForRoleIds(invitedByUserId, roleIds, "roleIds");
  if (boundary) return { ok: false, response: boundary };

  for (const roleId of roleIds) {
    const [row] = await getDb()`SELECT id FROM instance_roles WHERE id = ${roleId} LIMIT 1`;
    if (!row) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "One or more roles are invalid", {
          errors: [{ field: "roleIds", code: ErrorCodes.USER_NOT_FOUND, message: "Unknown role" }],
        }),
      };
    }
  }

  try {
    const created = await getDb().begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO instance_invites (
          email,
          invited_name,
          token_hash,
          invited_by_user_id,
          expires_at
        )
        VALUES (
          ${email},
          ${invitedName},
          ${tokenHash},
          ${invitedByUserId},
          ${expiresAt}
        )
        RETURNING id
      `;

      const id = String((inserted as { id: string }).id);
      await assignInviteRolesInTx(tx, id, roleIds);
      await writeAuditEvent(
        {
          actorUserId: invitedByUserId,
          action: "invite.created",
          resourceType: "instance_invite",
          resourceId: id,
          payload: { email },
        },
        tx,
      );
      const roles = await roleSummariesForInvite(id, tx);
      return { id, roles };
    });

    const inviteUrl = inviteUrlFromRequest(req, rawToken);
    const settings = await getInstanceSettings();
    const template = memberInviteEmailText({
      invitedName,
      organizationName: settings.organizationName,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    });
    let emailDelivery: import("@z0/contracts/email-delivery").EmailDeliveryStatus = "skipped";
    try {
      const delivery = await sendTransactionalEmail({
        to: email,
        subject: template.subject,
        text: template.text,
      });
      emailDelivery = delivery.status;
    } catch {
      emailDelivery = "failed";
    }

    return {
      ok: true,
      data: {
        id: created.id,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        email,
        invitedName,
        roles: created.roles,
        emailDelivery,
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
    if (error instanceof Error && error.message === "invite_roles_required") {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Choose at least one role", {
          errors: [{ field: "roleIds", code: ErrorCodes.REQUIRED, message: "At least one role is required" }],
        }),
      };
    }
    throw error;
  }
}

async function applyInviteMembership(
  tx: SQL,
  invite: InviteRow,
  userId: string,
  invitedByUserId: string | null,
): Promise<void> {
  await tx`
    INSERT INTO instance_members (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `;
  await tx`
    UPDATE instance_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = ${invite.id}
  `;
  await applyInviteRolesToMember(invite.id, userId, invitedByUserId, tx);
}

export async function acceptInstanceInvite(
  req: BunRequest,
  rawToken: string,
  body: AcceptInviteRequest,
): Promise<
  | { ok: true; userId: string; setCookie?: string; mfaRequired?: boolean }
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

  if (await isMemberByEmail(invite.email)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "You are already a member.", {
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

  if (session) {
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

    try {
      await getDb().begin(async (tx) => {
        await applyInviteMembership(tx, invite, user.id, invite.invited_by_user_id);
        await writeAuditEvent(
          {
            actorUserId: user.id,
            action: "invite.accepted",
            resourceType: "instance_invite",
            resourceId: invite.id,
            payload: { email: invite.email },
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Error && error.message === "invite_roles_missing") {
        return { ok: false, response: inviteRolesMissingResponse() };
      }
      throw error;
    }

    return { ok: true, userId: user.id };
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
      let userId: string;
      if (accountExists) {
        const [existing] = await tx`
          SELECT id
          FROM users
          WHERE lower(email) = ${invite.email}
            AND status = 'active'
          LIMIT 1
        `;
        if (!existing) {
          throw new Error("user_missing");
        }
        userId = String((existing as { id: string }).id);
        await tx`
          UPDATE users
          SET name = ${name}, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
          WHERE id = ${userId}
        `;
        await tx`
          INSERT INTO password_credentials (user_id, password_hash, updated_at)
          VALUES (${userId}, ${passwordHash}, NOW())
          ON CONFLICT (user_id) DO UPDATE
          SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
        `;
        await applyInviteMembership(tx, invite, userId, invite.invited_by_user_id);
        await writeAuditEvent(
          {
            actorUserId: userId,
            action: "invite.accepted",
            resourceType: "instance_invite",
            resourceId: invite.id,
            payload: { email: invite.email, rejoinedUser: true },
          },
          tx,
        );
      } else {
        const [user] = await tx`
          INSERT INTO users (email, name, email_verified_at)
          VALUES (${invite.email}, ${name}, NOW())
          RETURNING id
        `;
        userId = String((user as { id: string }).id);
        await tx`
          INSERT INTO password_credentials (user_id, password_hash)
          VALUES (${userId}, ${passwordHash})
        `;
        await applyInviteMembership(tx, invite, userId, invite.invited_by_user_id);
        await writeAuditEvent(
          {
            actorUserId: userId,
            action: "invite.accepted",
            resourceType: "instance_invite",
            resourceId: invite.id,
            payload: { email: invite.email, createdUser: true },
          },
          tx,
        );
      }
      return userId;
    });

    if (accountExists) {
      await revokeAllUserSessions(result);
    }

    if (await hasConsoleMfa(result)) {
      const challenge = await createConsoleMfaChallenge(req, result, "invitation", "/");
      return {
        ok: true,
        userId: result,
        setCookie: challenge.setCookie,
        mfaRequired: true,
      };
    }

    const { token, expiresAt } = await createSession(result, req, { authenticationMethod: "invitation" });
    return {
      ok: true,
      userId: result,
      setCookie: sessionCookieHeader(token, expiresAt),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "user_missing") {
      return {
        ok: false,
        response: problem(404, "Not Found", "This invitation is not valid.", {
          errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Account not found" }],
        }),
      };
    }
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "An account with this email already exists. Sign in to accept the invitation.", {
          errors: [{ field: "email", code: ErrorCodes.INVITE_ALREADY_MEMBER, message: "Account already exists" }],
        }),
      };
    }
    if (error instanceof Error && error.message === "invite_roles_missing") {
      return { ok: false, response: inviteRolesMissingResponse() };
    }
    throw error;
  }
}

export async function declineInstanceInvite(
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

  if (session) {
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
  } else if (accountExists && (await isMemberByEmail(invite.email))) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", "Sign in to decline this invitation.", {
        code: "AuthenticationRequired",
      }),
    };
  }

  await getDb()`
    UPDATE instance_invites
    SET status = 'declined', declined_at = NOW()
    WHERE id = ${invite.id}
  `;

  await writeAuditEvent({
    actorUserId: session?.userId ?? null,
    action: "invite.declined",
    resourceType: "instance_invite",
    resourceId: invite.id,
    payload: { email: invite.email },
  });

  return { ok: true };
}

async function memberRolesByUserIds(userIds: string[]): Promise<Map<string, RoleSummary[]>> {
  const map = new Map<string, RoleSummary[]>();
  if (userIds.length === 0) return map;

  const rows = await getDb()`
    SELECT mr.member_user_id, r.id, r.key, r.name
    FROM instance_member_roles mr
    JOIN instance_roles r ON r.id = mr.role_id
    WHERE mr.member_user_id = ANY(${pgTextArray(userIds)}::uuid[])
    ORDER BY r.name
  `;

  for (const row of rows) {
    const r = row as { member_user_id: string; id: string; key: string; name: string };
    const userId = String(r.member_user_id);
    const roles = map.get(userId) ?? [];
    roles.push({ id: String(r.id), key: r.key, name: r.name });
    map.set(userId, roles);
  }
  return map;
}

async function inviteRolesByInviteIds(inviteIds: string[]): Promise<Map<string, RoleSummary[]>> {
  const map = new Map<string, RoleSummary[]>();
  if (inviteIds.length === 0) return map;

  const rows = await getDb()`
    SELECT ir.invite_id, r.id, r.key, r.name
    FROM instance_invite_roles ir
    JOIN instance_roles r ON r.id = ir.role_id
    WHERE ir.invite_id = ANY(${pgTextArray(inviteIds)}::uuid[])
    ORDER BY r.name
  `;

  for (const row of rows) {
    const r = row as { invite_id: string; id: string; key: string; name: string };
    const inviteId = String(r.invite_id);
    const roles = map.get(inviteId) ?? [];
    roles.push({ id: String(r.id), key: r.key, name: r.name });
    map.set(inviteId, roles);
  }
  return map;
}

export async function listInstanceMembersForApi(statusFilter?: InstanceMember["status"]): Promise<InstanceMember[]> {
  const rows = await getDb()`
    SELECT
      u.id,
      u.email,
      u.name,
      m.joined_at,
      m.is_bootstrap,
      u.email_verified_at,
      u.disabled_at,
      u.locked_until,
      u.deleted_at
      , EXISTS (
        SELECT 1 FROM user_totp_factors f WHERE f.user_id = u.id AND f.confirmed_at IS NOT NULL
      ) AS mfa_enabled
      , (SELECT COUNT(*)::int FROM user_passkeys p WHERE p.user_id = u.id AND p.removed_at IS NULL) AS passkey_count
    FROM instance_members m
    JOIN users u ON u.id = m.user_id
    ORDER BY u.name ASC
  `;

  const userIds = rows.map((row) => String((row as { id: string }).id));
  const rolesByUserId = await memberRolesByUserIds(userIds);

  return rows.map((row) => {
    const r = row as {
      id: string;
      email: string;
      name: string;
      joined_at: Date;
      is_bootstrap: boolean;
      email_verified_at: Date | null;
      disabled_at: Date | null;
      locked_until: Date | null;
      deleted_at: Date | null;
      mfa_enabled: boolean;
      passkey_count: number;
    };
    const userId = String(r.id);
    const status = accountStatus(r);
    return {
      userId,
      email: r.email,
      name: r.name,
      joinedAt: new Date(r.joined_at).toISOString(),
      isBootstrap: Boolean(r.is_bootstrap),
      status,
      emailVerified: Boolean(r.email_verified_at),
      mfaEnabled: Boolean(r.mfa_enabled),
      passkeyCount: Number(r.passkey_count ?? 0),
      disabledAt: r.disabled_at ? new Date(r.disabled_at).toISOString() : null,
      lockedUntil: r.locked_until ? new Date(r.locked_until).toISOString() : null,
      deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
      roles: rolesByUserId.get(userId) ?? [],
    };
  }).filter((member) => statusFilter ? member.status === statusFilter : member.status !== "deleted");
}

export async function listPendingInstanceInvites(): Promise<PendingInvite[]> {
  const rows = await getDb()`
    SELECT id, email, invited_name, expires_at, created_at
    FROM instance_invites
    WHERE status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  const inviteIds = rows.map((row) => String((row as { id: string }).id));
  const rolesByInviteId = await inviteRolesByInviteIds(inviteIds);

  return rows.map((row) => {
    const r = row as {
      id: string;
      email: string;
      invited_name: string;
      expires_at: Date;
      created_at: Date;
    };
    const id = String(r.id);
    return {
      id,
      email: r.email,
      invitedName: r.invited_name,
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      roles: rolesByInviteId.get(id) ?? [],
    };
  });
}

export async function revokeInstanceInvite(
  inviteId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const [row] = await getDb()`
    UPDATE instance_invites
    SET status = 'revoked'
    WHERE id = ${inviteId}
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
    actorUserId,
    action: "invite.revoked",
    resourceType: "instance_invite",
    resourceId: inviteId,
  });

  return { ok: true };
}
