import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail } from "@z0/contracts/validation";

import {
  appSessionCookieHeader,
  createAppSession,
  resolveAppSession,
  resolveAppSessionForApp,
  type ActiveAppSession,
} from "./app-session";
import { getDb } from "./db";
import { scopeIsSubset } from "./oauth-consent";
import { parseScopeSet } from "./oauth";
import { problem } from "./http";

export type ServiceGroupContext = {
  groupId: string;
  ssoEnabled: boolean;
  appIds: string[];
};

export async function getServiceGroupForApp(appId: string): Promise<ServiceGroupContext | null> {
  const [row] = await getDb()`
    SELECT g.id AS group_id, g.sso_enabled
    FROM service_group_apps sga
    JOIN service_groups g ON g.id = sga.group_id
    WHERE sga.app_id = ${appId}
    LIMIT 1
  `;
  if (!row) return null;
  const data = row as { group_id: string; sso_enabled: boolean };
  const groupId = String(data.group_id);

  const appRows = await getDb()`
    SELECT app_id
    FROM service_group_apps
    WHERE group_id = ${groupId}
  `;

  return {
    groupId,
    ssoEnabled: data.sso_enabled,
    appIds: appRows.map((appRow) => String((appRow as { app_id: string }).app_id)),
  };
}

export async function getGroupMemberIdForAppUser(appUserId: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT group_member_id
    FROM service_group_app_users
    WHERE app_user_id = ${appUserId}
    LIMIT 1
  `;
  return row ? String((row as { group_member_id: string }).group_member_id) : null;
}

export async function ensureGroupMemberForAppUser(
  appUserId: string,
  appId: string,
  emailRaw: string,
): Promise<string | null> {
  const group = await getServiceGroupForApp(appId);
  if (!group) return null;

  const [verifiedUser] = await getDb()`
    SELECT 1
    FROM app_users
    WHERE id = ${appUserId}
      AND app_id = ${appId}
      AND status = 'active'
      AND email_verified_at IS NOT NULL
    LIMIT 1
  `;
  if (!verifiedUser) return null;

  const existingMemberId = await getGroupMemberIdForAppUser(appUserId);
  if (existingMemberId) return existingMemberId;

  const email = normalizeEmail(emailRaw);

  const [existingMember] = await getDb()`
    SELECT id
    FROM service_group_members
    WHERE group_id = ${group.groupId}
      AND primary_email = ${email}
    LIMIT 1
  `;

  let groupMemberId: string;
  if (existingMember) {
    groupMemberId = String((existingMember as { id: string }).id);
  } else {
    const [created] = await getDb()`
      INSERT INTO service_group_members (group_id, primary_email)
      VALUES (${group.groupId}, ${email})
      RETURNING id
    `;
    groupMemberId = String((created as { id: string }).id);
  }

  await getDb()`
    INSERT INTO service_group_app_users (group_member_id, app_user_id, app_id)
    VALUES (${groupMemberId}, ${appUserId}, ${appId})
    ON CONFLICT (app_user_id) DO NOTHING
  `;

  return groupMemberId;
}

async function getAppUserProfile(
  appUserId: string,
): Promise<{ email: string; name: string; emailVerified: boolean } | null> {
  const [row] = await getDb()`
    SELECT email, name, email_verified_at
    FROM app_users
    WHERE id = ${appUserId}
      AND status = 'active'
    LIMIT 1
  `;
  if (!row) return null;
  const data = row as { email: string; name: string; email_verified_at: Date | null };
  return { email: data.email, name: data.name, emailVerified: Boolean(data.email_verified_at) };
}

async function findLinkedAppUserId(groupMemberId: string, appId: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT app_user_id
    FROM service_group_app_users
    WHERE group_member_id = ${groupMemberId}
      AND app_id = ${appId}
    LIMIT 1
  `;
  return row ? String((row as { app_user_id: string }).app_user_id) : null;
}

async function findAppUserByEmail(appId: string, email: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT id
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
      AND status = 'active'
    LIMIT 1
  `;
  return row ? String((row as { id: string }).id) : null;
}

export async function provisionSiblingAppUser(input: {
  targetAppId: string;
  groupMemberId: string;
  sourceAppUserId: string;
}): Promise<{ ok: true; appUserId: string } | { ok: false; response: Response }> {
  const existing = await findLinkedAppUserId(input.groupMemberId, input.targetAppId);
  if (existing) return { ok: true, appUserId: existing };

  const sourceProfile = await getAppUserProfile(input.sourceAppUserId);
  if (!sourceProfile) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", "Source account is no longer available"),
    };
  }
  if (!sourceProfile.emailVerified) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "Verify your email before using shared sign-in"),
    };
  }

  const existingByEmail = await findAppUserByEmail(input.targetAppId, sourceProfile.email);
  if (existingByEmail) {
    return {
      ok: false,
      response: problem(409, "Conflict", "An account already exists for this application", {
        errors: [{
          field: "_auth",
          code: ErrorCodes.APP_USER_EXISTS,
          message: "Sign in to the existing account before linking shared sign-in",
        }],
      }),
    };
  }

  const [created] = await getDb()`
    INSERT INTO app_users (app_id, email, name, password_hash, email_verified_at)
    VALUES (
      ${input.targetAppId},
      ${sourceProfile.email},
      ${sourceProfile.name},
      NULL,
      NOW()
    )
    RETURNING id
  `;
  const appUserId = String((created as { id: string }).id);

  await getDb()`
    INSERT INTO service_group_app_users (group_member_id, app_user_id, app_id)
    VALUES (${input.groupMemberId}, ${appUserId}, ${input.targetAppId})
  `;

  return { ok: true, appUserId };
}

export async function getGroupConsentedScope(groupMemberId: string): Promise<string> {
  const rows = await getDb()`
    SELECT c.scope
    FROM service_group_app_users sgau
    JOIN oauth_user_consents c ON c.app_user_id = sgau.app_user_id
    WHERE sgau.group_member_id = ${groupMemberId}
  `;
  const merged = new Set<string>();
  const portableOidcScopes = new Set(["openid", "profile", "email"]);
  for (const row of rows) {
    for (const name of parseScopeSet(String((row as { scope: string }).scope ?? ""))) {
      if (portableOidcScopes.has(name)) merged.add(name);
    }
  }
  return [...merged].sort().join(" ");
}

export async function groupSsoCoversScope(groupMemberId: string, requestedScope: string): Promise<boolean> {
  const portableOidcScopes = new Set(["openid", "profile", "email"]);
  if ([...parseScopeSet(requestedScope)].some((scope) => !portableOidcScopes.has(scope))) {
    return false;
  }
  const granted = await getGroupConsentedScope(groupMemberId);
  if (!granted.trim()) return false;
  return scopeIsSubset(requestedScope, granted);
}

export type GroupSsoSessionResult =
  | { ok: true; appUserId: string; appId: string; setCookie: string }
  | { ok: false };

export async function tryGroupSsoSession(req: BunRequest, targetAppId: string): Promise<GroupSsoSessionResult> {
  const targetGroup = await getServiceGroupForApp(targetAppId);
  if (!targetGroup?.ssoEnabled) return { ok: false };

  const current = await resolveAppSession(req);
  if (!current) return { ok: false };

  if (current.appId === targetAppId) {
    return { ok: false };
  }

  if (!targetGroup.appIds.includes(current.appId)) return { ok: false };

  const sourceGroup = await getServiceGroupForApp(current.appId);
  if (!sourceGroup || sourceGroup.groupId !== targetGroup.groupId || !sourceGroup.ssoEnabled) {
    return { ok: false };
  }

  const groupMemberId = await getGroupMemberIdForAppUser(current.appUserId);
  if (!groupMemberId) return { ok: false };

  const provisioned = await provisionSiblingAppUser({
    targetAppId,
    groupMemberId,
    sourceAppUserId: current.appUserId,
  });
  if (!provisioned.ok) return { ok: false };

  const { token, expiresAt } = await createAppSession(provisioned.appUserId, targetAppId, req);
  return {
    ok: true,
    appUserId: provisioned.appUserId,
    appId: targetAppId,
    setCookie: appSessionCookieHeader(token, expiresAt),
  };
}

export type ResolvedTargetAppSession =
  | { session: ActiveAppSession; setCookie?: string }
  | null;

export async function resolveTargetAppSession(
  req: BunRequest,
  targetAppId: string,
): Promise<ResolvedTargetAppSession> {
  const direct = await resolveAppSessionForApp(req, targetAppId);
  if (direct) {
    return { session: direct };
  }

  const sso = await tryGroupSsoSession(req, targetAppId);
  if (!sso.ok) return null;

  return {
    session: {
      appUserId: sso.appUserId,
      appId: sso.appId,
      sessionId: "",
    },
    setCookie: sso.setCookie,
  };
}

export function appendSetCookie(headers: Headers, cookie: string | undefined): void {
  if (cookie) headers.append("Set-Cookie", cookie);
}
