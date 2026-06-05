import type { BunRequest } from "bun";
import type { SQL } from "bun";

import type {
  AcceptAppUserInviteRequest,
  AppUserDetail,
  AppUserInvitePreviewResponse,
  AppUserMembershipStatus,
  AppUserSummary,
  CreateAppUserInviteRequest,
  CreateAppUserInviteResponse,
  CreateAppUserRequest,
  PatchAppUserRequest,
  PendingAppUserInvite,
} from "@z0/contracts/app-users";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { getUserById } from "./auth";
import { writeAuditEvent } from "./audit";
import { findAppRow } from "./apps";
import { sha256Hex, randomToken } from "./crypto";
import { getDb } from "./db";
import { problem } from "./http";
import { isInstanceMember } from "./instance-members";
import { hashPassword } from "./password";
import { resolveSession } from "./session";
import { createSession, sessionCookieHeader } from "./session";
import { normalizeMetadata, validateAppUserMetadata } from "./app-user-metadata";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type MembershipRow = {
  user_id: string;
  app_id: string;
  status: AppUserMembershipStatus;
  metadata: Record<string, unknown> | null;
  joined_at: Date;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
};

type AppUserInviteRow = {
  id: string;
  app_id: string;
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

async function appNotFoundResponse(): Promise<Response> {
  return problem(404, "Not Found", "Application not found.", {
    errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
  });
}

async function appUserNotFoundResponse(): Promise<Response> {
  return problem(404, "Not Found", "App user not found.", {
    errors: [
      { field: "userId", code: ErrorCodes.APP_USER_NOT_FOUND, message: "App user not found" },
    ],
  });
}

async function findMembership(appId: string, userId: string): Promise<MembershipRow | null> {
  const [row] = await getDb()`
    SELECT user_id, app_id, status, metadata, joined_at
    FROM app_memberships
    WHERE app_id = ${appId}
      AND user_id = ${userId}
  `;
  if (!row) return null;
  const r = row as MembershipRow;
  return {
    ...r,
    user_id: String(r.user_id),
    app_id: String(r.app_id),
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    joined_at: new Date(r.joined_at),
  };
}

async function mapAppUserSummary(appId: string, userId: string): Promise<AppUserSummary | null> {
  const membership = await findMembership(appId, userId);
  if (!membership) return null;

  const [user] = await getDb()`
    SELECT id, email, name FROM users WHERE id = ${userId}
  `;
  if (!user) return null;
  const u = user as UserRow;

  return {
    userId: String(u.id),
    appId,
    email: u.email,
    name: u.name,
    membershipStatus: membership.status,
    isInstanceMember: await isInstanceMember(userId),
    joinedAt: membership.joined_at.toISOString(),
  };
}

export async function listAppUsersForApi(
  appId: string,
  searchQuery?: string,
): Promise<{ ok: true; users: AppUserSummary[] } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const q = searchQuery?.trim();
  const pattern = q ? `%${q}%` : null;

  const rows = pattern
    ? await getDb()`
        SELECT m.user_id, m.app_id, m.status, m.joined_at, u.email, u.name
        FROM app_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.app_id = ${appId}
          AND (u.email ILIKE ${pattern} OR u.name ILIKE ${pattern})
        ORDER BY u.name ASC
      `
    : await getDb()`
        SELECT m.user_id, m.app_id, m.status, m.joined_at, u.email, u.name
        FROM app_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.app_id = ${appId}
        ORDER BY u.name ASC
      `;

  const users: AppUserSummary[] = [];
  for (const row of rows) {
    const r = row as {
      user_id: string;
      app_id: string;
      status: AppUserMembershipStatus;
      joined_at: Date;
      email: string;
      name: string;
    };
    const userId = String(r.user_id);
    users.push({
      userId,
      appId: String(r.app_id),
      email: r.email,
      name: r.name,
      membershipStatus: r.status,
      isInstanceMember: await isInstanceMember(userId),
      joinedAt: new Date(r.joined_at).toISOString(),
    });
  }

  return { ok: true, users };
}

async function countUserActiveSessions(userId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM sessions
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

export async function getAppUserDetailForApi(
  appId: string,
  userId: string,
): Promise<{ ok: true; user: AppUserDetail } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const membership = await findMembership(appId, userId);
  if (!membership) return { ok: false, response: await appUserNotFoundResponse() };

  const summary = await mapAppUserSummary(appId, userId);
  if (!summary) return { ok: false, response: await appUserNotFoundResponse() };

  return {
    ok: true,
    user: {
      ...summary,
      metadata: membership.metadata,
      activeSessionCount: await countUserActiveSessions(userId),
    },
  };
}

async function membershipExistsForEmail(appId: string, email: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM app_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.app_id = ${appId}
      AND lower(u.email) = ${email}
    LIMIT 1
  `;
  return Boolean(row);
}

export async function createAppUserForApi(
  appId: string,
  actorUserId: string,
  body: CreateAppUserRequest,
): Promise<{ ok: true; user: AppUserDetail } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };
  if (app.status !== "active") {
    return {
      ok: false,
      response: problem(409, "Conflict", "Application is disabled.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_DISABLED, message: "Application is disabled" }],
      }),
    };
  }

  const email = normalizeEmail(body.email);
  const name = body.name.trim();
  const metadata = normalizeMetadata(body.metadata ?? null);

  const [existingUser] = await getDb()`
    SELECT id FROM users WHERE lower(email) = ${email}
  `;

  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.name, "name", "Name"),
    ...validateAppUserMetadata(body.metadata),
  ];
  if (!existingUser) {
    errors.push(
      ...validatePassword(body.password ?? "", { email, name }),
      ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
    );
  }
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }

  if (await membershipExistsForEmail(appId, email)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "This person is already a user of this application.", {
        errors: [
          {
            field: "email",
            code: ErrorCodes.APP_USER_EXISTS,
            message: "Already registered for this application",
          },
        ],
      }),
    };
  }

  const passwordHash = existingUser ? null : await hashPassword(body.password);

  try {
    const userId = await getDb().begin(async (tx) => {
      let userId: string;
      if (existingUser) {
        userId = String((existingUser as { id: string }).id);
        const hasMembership = await tx`
          SELECT 1 FROM app_memberships WHERE app_id = ${appId} AND user_id = ${userId}
        `;
        if (hasMembership) {
          throw new Error("app_user_exists");
        }
        await tx`
          UPDATE users SET name = ${name}, updated_at = NOW()
          WHERE id = ${userId}
        `;
      } else {
        const [user] = await tx`
          INSERT INTO users (email, name, email_verified_at)
          VALUES (${email}, ${name}, NOW())
          RETURNING id
        `;
        userId = String((user as { id: string }).id);
        await tx`
          INSERT INTO password_credentials (user_id, password_hash)
          VALUES (${userId}, ${passwordHash})
        `;
      }

      await tx`
        INSERT INTO app_memberships (user_id, app_id, metadata)
        VALUES (${userId}, ${appId}, ${metadata})
      `;

      await writeAuditEvent(
        {
          actorUserId,
          action: "app_user.created",
          resourceType: "app_membership",
          resourceId: `${appId}:${userId}`,
          payload: { appId, email, linkedExistingUser: Boolean(existingUser) },
        },
        tx,
      );

      return userId;
    });

    const detail = await getAppUserDetailForApi(appId, userId);
    if (!detail.ok) return detail;
    return { ok: true, user: detail.user };
  } catch (error) {
    if (error instanceof Error && error.message === "app_user_exists") {
      return {
        ok: false,
        response: problem(409, "Conflict", "This person is already a user of this application.", {
          errors: [
            {
              field: "email",
              code: ErrorCodes.APP_USER_EXISTS,
              message: "Already registered for this application",
            },
          ],
        }),
      };
    }
    throw error;
  }
}

export async function patchAppUserForApi(
  appId: string,
  userId: string,
  actorUserId: string,
  body: PatchAppUserRequest,
): Promise<{ ok: true; user: AppUserDetail } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const membership = await findMembership(appId, userId);
  if (!membership) return { ok: false, response: await appUserNotFoundResponse() };

  if (
    body.name === undefined &&
    body.membershipStatus === undefined &&
    body.metadata === undefined
  ) {
    const detail = await getAppUserDetailForApi(appId, userId);
    if (!detail.ok) return detail;
    return { ok: true, user: detail.user };
  }

  const errors = [...validateAppUserMetadata(body.metadata)];
  if (body.membershipStatus !== undefined && body.membershipStatus !== "active" && body.membershipStatus !== "disabled") {
    errors.push({
      field: "membershipStatus",
      code: ErrorCodes.REQUIRED,
      message: "Status must be active or disabled",
    });
  }
  if (body.name !== undefined) {
    errors.push(...validateRequiredString(body.name, "name", "Name"));
  }
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }

  if (body.name !== undefined) {
    await getDb()`
      UPDATE users SET name = ${body.name.trim()}, updated_at = NOW()
      WHERE id = ${userId}
    `;
  }

  const metadata =
    body.metadata === undefined
      ? membership.metadata
      : normalizeMetadata(body.metadata);

  const status = body.membershipStatus ?? membership.status;

  await getDb()`
    UPDATE app_memberships
    SET
      status = ${status},
      metadata = ${metadata},
      updated_at = NOW()
    WHERE app_id = ${appId}
      AND user_id = ${userId}
  `;

  await writeAuditEvent({
    actorUserId,
    action: status === "disabled" ? "app_user.disabled" : "app_user.updated",
    resourceType: "app_membership",
    resourceId: `${appId}:${userId}`,
    payload: { appId, membershipStatus: status },
  });

  const detail = await getAppUserDetailForApi(appId, userId);
  if (!detail.ok) return detail;
  return { ok: true, user: detail.user };
}

function inviteStatus(row: AppUserInviteRow): AppUserInvitePreviewResponse["status"] {
  if (row.status === "pending" && row.expires_at.getTime() < Date.now()) return "expired";
  return row.status as AppUserInvitePreviewResponse["status"];
}

export function appUserInviteUrlFromRequest(req: Request, rawToken: string): string {
  const origin = new URL(req.url).origin;
  return `${origin}/auth/app-invite/${rawToken}`;
}

async function findAppUserInviteByToken(rawToken: string): Promise<AppUserInviteRow | null> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    SELECT
      id,
      app_id,
      email,
      invited_name,
      token_hash,
      status,
      invited_by_user_id,
      expires_at,
      accepted_at,
      declined_at,
      created_at
    FROM app_user_invites
    WHERE token_hash = ${tokenHash}
  `;
  if (!row) return null;
  const r = row as AppUserInviteRow;
  return {
    ...r,
    id: String(r.id),
    app_id: String(r.app_id),
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

export async function buildAppUserInvitePreview(
  req: Request,
  rawToken: string,
): Promise<AppUserInvitePreviewResponse | Response> {
  const invite = await findAppUserInviteByToken(rawToken);
  if (!invite) {
    return problem(404, "Not Found", "This invitation is not valid.", {
      errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Invitation not found" }],
    });
  }

  const app = await findAppRow(invite.app_id);
  if (!app) {
    return problem(404, "Not Found", "This invitation is not valid.", {
      errors: [{ field: "_invite", code: ErrorCodes.INVITE_INVALID, message: "Application not found" }],
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
    appId: invite.app_id,
    appName: app.name,
    expiresAt: invite.expires_at.toISOString(),
    accountExists: await userExistsByEmail(invite.email),
    viewer: {
      authenticated: Boolean(sessionUser),
      emailMatches,
      email: sessionUser?.email,
    },
  };
}

export async function createAppUserInviteForApi(
  req: BunRequest,
  appId: string,
  invitedByUserId: string,
  body: CreateAppUserInviteRequest,
): Promise<{ ok: true; data: CreateAppUserInviteResponse } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.invitedName, "invitedName", "Name"),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid invite request", { errors }) };
  }

  const email = normalizeEmail(body.email);
  const invitedName = body.invitedName.trim();

  if (await membershipExistsForEmail(appId, email)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "This person is already a user of this application.", {
        errors: [
          {
            field: "email",
            code: ErrorCodes.APP_USER_EXISTS,
            message: "Already registered for this application",
          },
        ],
      }),
    };
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  try {
    const [inserted] = await getDb()`
      INSERT INTO app_user_invites (
        app_id,
        email,
        invited_name,
        token_hash,
        invited_by_user_id,
        expires_at
      )
      VALUES (
        ${appId},
        ${email},
        ${invitedName},
        ${tokenHash},
        ${invitedByUserId},
        ${expiresAt}
      )
      RETURNING id
    `;

    const id = String((inserted as { id: string }).id);
    await writeAuditEvent({
      actorUserId: invitedByUserId,
      action: "app_user_invite.created",
      resourceType: "app_user_invite",
      resourceId: id,
      payload: { appId, email },
    });

    return {
      ok: true,
      data: {
        id,
        inviteUrl: appUserInviteUrlFromRequest(req, rawToken),
        expiresAt: expiresAt.toISOString(),
        email,
        invitedName,
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

async function applyAppUserMembership(
  tx: SQL,
  invite: AppUserInviteRow,
  userId: string,
): Promise<void> {
  await tx`
    INSERT INTO app_memberships (user_id, app_id)
    VALUES (${userId}, ${invite.app_id})
    ON CONFLICT (user_id, app_id) DO NOTHING
  `;
  await tx`
    UPDATE app_user_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = ${invite.id}
  `;
}

export async function acceptAppUserInvite(
  req: BunRequest,
  rawToken: string,
  body: AcceptAppUserInviteRequest,
): Promise<{ ok: true; userId: string; setCookie?: string } | { ok: false; response: Response }> {
  const invite = await findAppUserInviteByToken(rawToken);
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

    if (await membershipExistsForEmail(invite.app_id, invite.email)) {
      return {
        ok: false,
        response: problem(409, "Conflict", "You are already a user of this application.", {
          errors: [
            {
              field: "_invite",
              code: ErrorCodes.APP_USER_EXISTS,
              message: "Already registered for this application",
            },
          ],
        }),
      };
    }

    const userId = user.id;
    await getDb().begin(async (tx) => {
      await applyAppUserMembership(tx, invite, userId);
      await writeAuditEvent(
        {
          actorUserId: userId,
          action: "app_user_invite.accepted",
          resourceType: "app_user_invite",
          resourceId: invite.id,
          payload: { appId: invite.app_id, email: invite.email },
        },
        tx,
      );
    });

    return { ok: true, userId };
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
      await applyAppUserMembership(tx, invite, userId);
      await writeAuditEvent(
        {
          actorUserId: userId,
          action: "app_user_invite.accepted",
          resourceType: "app_user_invite",
          resourceId: invite.id,
          payload: { appId: invite.app_id, email: invite.email, createdUser: true },
        },
        tx,
      );
      return userId;
    });

    const { token, expiresAt } = await createSession(result, req);
    return {
      ok: true,
      userId: result,
      setCookie: sessionCookieHeader(token, expiresAt),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "An account with this email already exists. Sign in to accept the invitation.", {
          errors: [{ field: "email", code: ErrorCodes.APP_USER_EXISTS, message: "Account already exists" }],
        }),
      };
    }
    throw error;
  }
}

export async function declineAppUserInvite(
  req: BunRequest,
  rawToken: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const invite = await findAppUserInviteByToken(rawToken);
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
    UPDATE app_user_invites
    SET status = 'declined', declined_at = NOW()
    WHERE id = ${invite.id}
  `;

  await writeAuditEvent({
    actorUserId: session?.userId ?? null,
    action: "app_user_invite.declined",
    resourceType: "app_user_invite",
    resourceId: invite.id,
    payload: { appId: invite.app_id, email: invite.email },
  });

  return { ok: true };
}

export async function listPendingAppUserInvites(
  appId: string,
): Promise<{ ok: true; invites: PendingAppUserInvite[] } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const rows = await getDb()`
    SELECT id, email, invited_name, expires_at, created_at
    FROM app_user_invites
    WHERE app_id = ${appId}
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  return {
    ok: true,
    invites: rows.map((row) => {
      const r = row as {
        id: string;
        email: string;
        invited_name: string;
        expires_at: Date;
        created_at: Date;
      };
      return {
        id: String(r.id),
        email: r.email,
        invitedName: r.invited_name,
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      };
    }),
  };
}

export async function revokeAppUserInvite(
  appId: string,
  inviteId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const [row] = await getDb()`
    UPDATE app_user_invites
    SET status = 'revoked'
    WHERE id = ${inviteId}
      AND app_id = ${appId}
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
    action: "app_user_invite.revoked",
    resourceType: "app_user_invite",
    resourceId: inviteId,
    payload: { appId },
  });

  return { ok: true };
}
