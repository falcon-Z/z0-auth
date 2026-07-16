import type { BunRequest } from "bun";

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

import { writeAuditEvent } from "./audit";
import { findAppRow } from "./apps";
import { sha256Hex, randomToken } from "./crypto";
import { getDb } from "./db";
import { problem } from "./http";
import { countActiveAppUserSessions } from "./app-session";
import { hashPassword } from "./password";
import { normalizeMetadata, validateAppUserMetadata } from "./app-user-metadata";
import { appUserInviteEmailText, sendTransactionalEmail } from "./transactional-email";
import { requestPublicOrigin } from "./config";
import { accountStatus } from "./account-lifecycle";
import { revokeAppAccountAccess } from "./account-lifecycle";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AppUserRow = {
  id: string;
  app_id: string;
  email: string;
  name: string;
  status: AppUserMembershipStatus;
  metadata: Record<string, unknown> | null;
  email_verified_at: Date | null;
  disabled_at: Date | null;
  locked_until: Date | null;
  deleted_at: Date | null;
  created_at: Date;
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

function mapAppUserRow(row: AppUserRow): AppUserSummary {
  const status = accountStatus(row);
  return {
    userId: String(row.id),
    appId: String(row.app_id),
    email: row.email,
    name: row.name,
    membershipStatus: status,
    status,
    emailVerified: Boolean(row.email_verified_at),
    disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
    lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    joinedAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeAppUserRow(row: AppUserRow): AppUserRow {
  return {
    ...row,
    id: String(row.id),
    app_id: String(row.app_id),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    email_verified_at: row.email_verified_at ? new Date(row.email_verified_at) : null,
    disabled_at: row.disabled_at ? new Date(row.disabled_at) : null,
    locked_until: row.locked_until ? new Date(row.locked_until) : null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
    created_at: new Date(row.created_at),
  };
}

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

async function findAppUser(appId: string, userId: string): Promise<AppUserRow | null> {
  const [row] = await getDb()`
    SELECT id, app_id, email, name, status, metadata, email_verified_at,
           disabled_at, locked_until, deleted_at, created_at
    FROM app_users
    WHERE app_id = ${appId}
      AND id = ${userId}
  `;
  if (!row) return null;
  return normalizeAppUserRow(row as AppUserRow);
}

async function appUserExistsForEmail(appId: string, email: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
    LIMIT 1
  `;
  return Boolean(row);
}

export async function listAppUsersForApi(
  appId: string,
  searchQuery?: string,
  statusFilter?: AppUserMembershipStatus,
): Promise<{ ok: true; users: AppUserSummary[] } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const q = searchQuery?.trim();
  const pattern = q ? `%${q}%` : null;

  const rows = pattern
    ? await getDb()`
        SELECT id, app_id, email, name, status, metadata, email_verified_at,
               disabled_at, locked_until, deleted_at, created_at
        FROM app_users
        WHERE app_id = ${appId}
          AND (email ILIKE ${pattern} OR name ILIKE ${pattern})
        ORDER BY name ASC
      `
    : await getDb()`
        SELECT id, app_id, email, name, status, metadata, email_verified_at,
               disabled_at, locked_until, deleted_at, created_at
        FROM app_users
        WHERE app_id = ${appId}
        ORDER BY name ASC
      `;

  return {
    ok: true,
    users: rows
      .map((row) => mapAppUserRow(normalizeAppUserRow(row as AppUserRow)))
      .filter((user) => statusFilter ? user.status === statusFilter : user.status !== "deleted"),
  };
}

export async function getAppUserDetailForApi(
  appId: string,
  userId: string,
): Promise<{ ok: true; user: AppUserDetail } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const appUser = await findAppUser(appId, userId);
  if (!appUser) return { ok: false, response: await appUserNotFoundResponse() };

  const activeSessionCount = await countActiveAppUserSessions(userId);
  const [mfaRow] = await getDb()`
    SELECT 1 FROM app_user_totp_factors WHERE app_user_id = ${userId} AND confirmed_at IS NOT NULL
  `;
  const [passkeyRow] = await getDb()`
    SELECT COUNT(*)::int AS count FROM app_user_passkeys
    WHERE app_user_id = ${userId} AND app_id = ${appId} AND removed_at IS NULL
  `;

  return {
    ok: true,
    user: {
      ...mapAppUserRow(appUser),
      metadata: appUser.metadata,
      activeSessionCount,
      mfaEnabled: Boolean(mfaRow),
      passkeyCount: Number((passkeyRow as { count: number }).count ?? 0),
    },
  };
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

  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.name, "name", "Name"),
    ...validateAppUserMetadata(body.metadata),
    ...validatePassword(body.password ?? "", { email, name }),
    ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }

  if (await appUserExistsForEmail(appId, email)) {
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

  const passwordHash = await hashPassword(body.password!);

  try {
    const userId = await getDb().begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO app_users (app_id, email, name, password_hash, metadata, email_verified_at)
        VALUES (${appId}, ${email}, ${name}, ${passwordHash}, ${metadata}, NOW())
        RETURNING id
      `;
      const id = String((inserted as { id: string }).id);

      await writeAuditEvent(
        {
          actorUserId,
          action: "app_user.created",
          resourceType: "app_user",
          resourceId: id,
          payload: { appId, email },
        },
        tx,
      );

      return id;
    });

    const detail = await getAppUserDetailForApi(appId, userId);
    if (!detail.ok) return detail;
    return { ok: true, user: detail.user };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
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

  const appUser = await findAppUser(appId, userId);
  if (!appUser) return { ok: false, response: await appUserNotFoundResponse() };

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

  const outcome = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT id, app_id, email, name, status, metadata, email_verified_at,
             disabled_at, locked_until, deleted_at, created_at
      FROM app_users
      WHERE app_id = ${appId} AND id = ${userId}
      FOR UPDATE
    `;
    if (!row) return "not_found" as const;

    const lockedUser = normalizeAppUserRow(row as AppUserRow);
    const currentStatus = accountStatus(lockedUser);
    if (currentStatus === "deleted") return "deleted" as const;

    const metadata = body.metadata === undefined
      ? lockedUser.metadata
      : normalizeMetadata(body.metadata);
    const status = body.membershipStatus ?? (currentStatus === "disabled" ? "disabled" : "active");
    const name = body.name !== undefined ? body.name.trim() : lockedUser.name;
    const disablingUser = currentStatus !== "disabled" && status === "disabled";
    const enablingUser = currentStatus === "disabled" && status === "active";

    await tx`
      UPDATE app_users
      SET
        name = ${name},
        status = ${status},
        disabled_at = CASE
          WHEN ${disablingUser} THEN NOW()
          WHEN ${enablingUser} THEN NULL
          ELSE disabled_at
        END,
        disabled_by_user_id = CASE
          WHEN ${disablingUser} THEN ${actorUserId}
          WHEN ${enablingUser} THEN NULL
          ELSE disabled_by_user_id
        END,
        locked_until = CASE WHEN ${enablingUser} THEN NULL ELSE locked_until END,
        failed_sign_in_count = CASE WHEN ${enablingUser} THEN 0 ELSE failed_sign_in_count END,
        failed_sign_in_window_started_at = CASE WHEN ${enablingUser} THEN NULL ELSE failed_sign_in_window_started_at END,
        metadata = ${metadata},
        updated_at = NOW()
      WHERE app_id = ${appId}
        AND id = ${userId}
    `;

    if (disablingUser) {
      await revokeAppAccountAccess(tx, userId, appId, lockedUser.email);
    }

    await writeAuditEvent({
      actorUserId,
      action: disablingUser ? "app_user.disabled" : enablingUser ? "app_user.enabled" : "app_user.updated",
      resourceType: "app_user",
      resourceId: userId,
      payload: { appId, membershipStatus: status },
    }, tx);
    return "updated" as const;
  });

  if (outcome === "not_found") {
    return { ok: false, response: await appUserNotFoundResponse() };
  }
  if (outcome === "deleted") {
    return { ok: false, response: problem(409, "Conflict", "Restore this account before updating it.", {
      errors: [{ field: "status", code: ErrorCodes.ACCOUNT_STATE_CONFLICT, message: "Account is deleted" }],
    }) };
  }

  const detail = await getAppUserDetailForApi(appId, userId);
  if (!detail.ok) return detail;
  return { ok: true, user: detail.user };
}

export type AppUserLifecycleAction = "disable" | "enable" | "unlock" | "delete" | "restore" | "permanently-delete";

export async function transitionAppUserForApi(
  appId: string,
  userId: string,
  actorUserId: string,
  action: AppUserLifecycleAction,
  confirmationEmail?: string,
): Promise<{ ok: true; user: AppUserDetail | null } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const outcome = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT id, app_id, email, name, status, metadata, email_verified_at,
             disabled_at, locked_until, deleted_at, created_at
      FROM app_users
      WHERE app_id = ${appId} AND id = ${userId}
      FOR UPDATE
    `;
    if (!row) return { error: "not_found" as const };
    const user = normalizeAppUserRow(row as AppUserRow);
    const current = accountStatus(user);

    if (action === "permanently-delete") {
      if (current !== "deleted") return { error: "conflict" as const };
      if (normalizeEmail(confirmationEmail ?? "") !== user.email) return { error: "confirmation" as const };
      await writeAuditEvent({
        actorUserId,
        action: "app_user.permanently_deleted",
        resourceType: "app_user",
        resourceId: userId,
        payload: { appId },
      }, tx);
      await tx`DELETE FROM magic_link_tokens WHERE realm = 'app' AND app_id = ${appId} AND lower(email) = ${user.email}`;
      await tx`DELETE FROM app_users WHERE app_id = ${appId} AND id = ${userId}`;
      await tx`
        DELETE FROM service_group_members gm
        WHERE NOT EXISTS (SELECT 1 FROM service_group_app_users gu WHERE gu.group_member_id = gm.id)
      `;
      await tx`
        DELETE FROM app_browser_sessions b
        WHERE NOT EXISTS (SELECT 1 FROM app_user_sessions s WHERE s.browser_session_id = b.id)
      `;
      return { error: null, deleted: true as const };
    }

    if (action === "disable") {
      if (current !== "active" && current !== "locked") return { error: "conflict" as const };
      await tx`
        UPDATE app_users SET status = 'disabled', disabled_at = NOW(), disabled_by_user_id = ${actorUserId}, updated_at = NOW()
        WHERE app_id = ${appId} AND id = ${userId}
      `;
      await revokeAppAccountAccess(tx, userId, appId, user.email);
      await writeAuditEvent({ actorUserId, action: "app_user.disabled", resourceType: "app_user", resourceId: userId, payload: { appId } }, tx);
    } else if (action === "enable") {
      if (current !== "disabled" || user.deleted_at) return { error: "conflict" as const };
      await tx`
        UPDATE app_users SET status = 'active', disabled_at = NULL, disabled_by_user_id = NULL,
          locked_until = NULL, failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE app_id = ${appId} AND id = ${userId}
      `;
      await writeAuditEvent({ actorUserId, action: "app_user.enabled", resourceType: "app_user", resourceId: userId, payload: { appId } }, tx);
    } else if (action === "unlock") {
      if (current !== "locked") return { error: "conflict" as const };
      await tx`
        UPDATE app_users SET locked_until = NULL, failed_sign_in_count = 0,
          failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE app_id = ${appId} AND id = ${userId}
      `;
      await writeAuditEvent({ actorUserId, action: "app_user.unlocked", resourceType: "app_user", resourceId: userId, payload: { appId } }, tx);
    } else if (action === "delete") {
      if (current === "deleted") return { error: "conflict" as const };
      await tx`
        UPDATE app_users SET status = 'disabled', deleted_at = NOW(), deleted_by_user_id = ${actorUserId},
          disabled_at = COALESCE(disabled_at, NOW()), disabled_by_user_id = COALESCE(disabled_by_user_id, ${actorUserId}),
          locked_until = NULL, failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE app_id = ${appId} AND id = ${userId}
      `;
      await revokeAppAccountAccess(tx, userId, appId, user.email);
      await writeAuditEvent({ actorUserId, action: "app_user.deleted", resourceType: "app_user", resourceId: userId, payload: { appId } }, tx);
    } else if (action === "restore") {
      if (current !== "deleted") return { error: "conflict" as const };
      await tx`
        UPDATE app_users SET status = 'disabled', deleted_at = NULL, deleted_by_user_id = NULL,
          disabled_at = NOW(), disabled_by_user_id = ${actorUserId}, locked_until = NULL,
          failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE app_id = ${appId} AND id = ${userId}
      `;
      await writeAuditEvent({ actorUserId, action: "app_user.restored", resourceType: "app_user", resourceId: userId, payload: { appId, status: "disabled" } }, tx);
    }
    return { error: null, deleted: false as const };
  });

  if (outcome.error === "not_found") return { ok: false, response: await appUserNotFoundResponse() };
  if (outcome.error === "confirmation") {
    return { ok: false, response: problem(400, "Validation Error", "Confirmation email does not match.", {
      errors: [{ field: "confirmationEmail", code: ErrorCodes.REQUIRED, message: "Type the account email exactly" }],
    }) };
  }
  if (outcome.error === "conflict") {
    return { ok: false, response: problem(409, "Conflict", "The account cannot make that state change.", {
      errors: [{ field: "status", code: ErrorCodes.ACCOUNT_STATE_CONFLICT, message: "Account state changed; reload and try again" }],
    }) };
  }
  if (outcome.deleted) return { ok: true, user: null };
  const detail = await getAppUserDetailForApi(appId, userId);
  if (!detail.ok) return detail;
  return { ok: true, user: detail.user };
}

function inviteStatus(row: AppUserInviteRow): AppUserInvitePreviewResponse["status"] {
  if (row.status === "pending" && row.expires_at.getTime() < Date.now()) return "expired";
  return row.status as AppUserInvitePreviewResponse["status"];
}

export function appUserInviteUrlFromRequest(req: Request, rawToken: string): string {
  return `${requestPublicOrigin(req)}/auth/app-invite/${rawToken}`;
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

export async function buildAppUserInvitePreview(
  _req: Request,
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

  return {
    status,
    email: invite.email,
    invitedName: invite.invited_name,
    appId: invite.app_id,
    appName: app.name,
    expiresAt: invite.expires_at.toISOString(),
    accountExists: await appUserExistsForEmail(invite.app_id, invite.email),
    viewer: {
      authenticated: false,
      emailMatches: false,
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

  if (await appUserExistsForEmail(appId, email)) {
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

    const inviteUrl = appUserInviteUrlFromRequest(req, rawToken);
    const template = appUserInviteEmailText({
      invitedName,
      appName: app.name,
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
        id,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        email,
        invitedName,
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
    throw error;
  }
}

export async function acceptAppUserInvite(
  _req: BunRequest,
  rawToken: string,
  body: AcceptAppUserInviteRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
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

  if (await appUserExistsForEmail(invite.app_id, invite.email)) {
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
    const userId = await getDb().begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO app_users (app_id, email, name, password_hash, email_verified_at)
        VALUES (${invite.app_id}, ${invite.email}, ${name}, ${passwordHash}, NOW())
        RETURNING id
      `;
      const id = String((inserted as { id: string }).id);

      await tx`
        UPDATE app_user_invites
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = ${invite.id}
      `;

      await writeAuditEvent(
        {
          actorUserId: null,
          action: "app_user_invite.accepted",
          resourceType: "app_user_invite",
          resourceId: invite.id,
          payload: { appId: invite.app_id, email: invite.email, appUserId: id },
        },
        tx,
      );

      return id;
    });

    return { ok: true, userId };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "An account with this email already exists for this application.", {
          errors: [{ field: "email", code: ErrorCodes.APP_USER_EXISTS, message: "Account already exists" }],
        }),
      };
    }
    throw error;
  }
}

export async function declineAppUserInvite(
  _req: BunRequest,
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

  await getDb()`
    UPDATE app_user_invites
    SET status = 'declined', declined_at = NOW()
    WHERE id = ${invite.id}
  `;

  await writeAuditEvent({
    actorUserId: null,
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
