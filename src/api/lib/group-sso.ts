import type { BunRequest } from "bun";

import {
  appSessionCookieHeader,
  insertAppSession,
  prepareAppSession,
  resolveAppSessionForApp,
  type ActiveAppSession,
} from "./app-session";
import { createAppUserMfaChallenge, hasAppUserMfa } from "./mfa";
import { finalizeAppPasswordSignIn } from "./account-lifecycle";
import { getDb } from "./db";
import { createServiceGroups } from "../../capabilities/service-groups";

export type ServiceGroupContext = {
  groupId: string;
  accountDomainId: string;
  ssoEnabled: boolean;
  appIds: string[];
};

export async function getServiceGroupForApp(appId: string): Promise<ServiceGroupContext | null> {
  const [row] = await getDb()`
    SELECT g.id AS group_id, g.account_domain_id, g.sso_enabled,
      ARRAY(SELECT app_id::text FROM service_group_apps WHERE group_id = g.id) AS app_ids
    FROM service_group_apps ga JOIN service_groups g ON g.id = ga.group_id
    JOIN apps a ON a.id = ga.app_id AND a.account_domain_id = g.account_domain_id
    WHERE a.id = ${appId} AND a.status = 'active'
  `;
  return row ? {
    groupId: String(row.group_id), accountDomainId: String(row.account_domain_id),
    ssoEnabled: Boolean(row.sso_enabled), appIds: row.app_ids as string[],
  } : null;
}

export type GroupSsoSessionResult =
  | { ok: true; mfaRequired: false; appUserId: string; appId: string; sessionId: string; setCookie: string }
  | { ok: true; mfaRequired: true; appUserId: string; appId: string; setCookie: string }
  | { ok: false };

export async function tryGroupSsoSession(req: BunRequest, targetAppId: string): Promise<GroupSsoSessionResult> {
  const group = await getServiceGroupForApp(targetAppId);
  if (!group?.ssoEnabled) return { ok: false };
  const current = await resolveAppSessionForApp(req, null, group.accountDomainId);
  if (!current || current.appId === targetAppId) return { ok: false };

  // Only canonical Account equality grants continuity. No email matching, JIT
  // membership, metadata/profile copying, or sibling consent authority.
  const [target] = await getDb()`
    SELECT t.id, t.account_id, t.account_domain_id, t.membership_status,
      t.status, t.disabled_at, t.deleted_at, t.locked_until, s.account_id AS source_account_id,
      s.primary_authenticated_at, s.mfa_authenticated_at, s.authentication_method
    FROM app_user_sessions s
    JOIN app_users t ON t.account_id = s.account_id AND t.account_domain_id = s.account_domain_id
    WHERE s.id = ${current.sessionId} AND t.app_id = ${targetAppId}
  `;
  const decision = createServiceGroups().resolveSharedSignIn({
    serviceGroup: { id: group.groupId, accountDomainId: group.accountDomainId,
      applicationIds: group.appIds, ssoEnabled: group.ssoEnabled },
    source: { applicationId: current.appId, accountId: String(target?.source_account_id ?? ""),
      accountDomainId: group.accountDomainId, eligible: true },
    target: { applicationId: targetAppId, accountId: target ? String(target.account_id) : null,
      accountDomainId: group.accountDomainId, subjectId: target ? String(target.id) : null,
      membershipStatus: target?.membership_status ?? "removed",
      eligible: Boolean(target && target.status === "active" && !target.disabled_at && !target.deleted_at
        && (!target.locked_until || new Date(target.locked_until).getTime() <= Date.now())) },
  });
  if (decision.outcome !== "reuse_account") return { ok: false };
  const appUserId = decision.targetSubjectId;
  // Preserve the existing MFA gate. Full policy/JIT enrollment is tracked by #105.
  if (!target.mfa_authenticated_at && (await hasAppUserMfa(appUserId, targetAppId))) {
    const url = new URL(req.url);
    const challenge = await createAppUserMfaChallenge(req, appUserId, targetAppId,
      "service_group", `${url.pathname}${url.search}`, current.sessionId);
    return { ok: true, mfaRequired: true, appUserId, appId: targetAppId, setCookie: challenge.setCookie };
  }

  const prepared = await prepareAppSession(req);
  const session = await finalizeAppPasswordSignIn(appUserId, targetAppId, async (tx) => {
    const [source] = await tx`
      SELECT s.primary_authenticated_at, s.mfa_authenticated_at, s.authentication_method
      FROM app_user_sessions s JOIN app_browser_sessions b ON b.id = s.browser_session_id
      JOIN apps a ON a.id = s.app_id
      JOIN app_users u ON u.id = s.app_user_id AND u.app_id = s.app_id
      JOIN apps target_app ON target_app.id = ${targetAppId} AND target_app.status = 'active'
      JOIN service_group_apps source_group ON source_group.app_id = s.app_id
      JOIN service_group_apps target_group ON target_group.app_id = target_app.id
        AND target_group.group_id = source_group.group_id
      JOIN service_groups g ON g.id = source_group.group_id
      WHERE s.id = ${current.sessionId} AND s.account_id = ${target.account_id}
        AND a.status = 'active' AND s.revoked_at IS NULL AND s.expires_at > NOW()
        AND b.revoked_at IS NULL AND b.expires_at > NOW()
        AND u.status = 'active' AND u.disabled_at IS NULL AND u.deleted_at IS NULL
        AND (u.locked_until IS NULL OR u.locked_until <= NOW())
        AND g.id = ${group.groupId} AND g.account_domain_id = s.account_domain_id AND g.sso_enabled
      FOR UPDATE OF s, b
      FOR SHARE OF g, a, target_app
    `;
    if (!source) return null;
    const issued = await insertAppSession(tx, appUserId, targetAppId, prepared, {
      primaryAuthenticatedAt: new Date(source.primary_authenticated_at),
      mfaAuthenticatedAt: source.mfa_authenticated_at ? new Date(source.mfa_authenticated_at) : null,
      authenticationMethod: String(source.authentication_method),
    });
    const [grant] = await tx`SELECT id FROM app_user_sessions WHERE app_user_id = ${appUserId}
      AND app_id = ${targetAppId} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`;
    return { ...issued, sessionId: String(grant.id) };
  });
  if (!session) return { ok: false };
  return { ok: true, mfaRequired: false, appUserId, appId: targetAppId,
    sessionId: session.sessionId, setCookie: appSessionCookieHeader(session.token, session.expiresAt) };
}

export type ResolvedTargetAppSession =
  | { session: ActiveAppSession; setCookie?: string }
  | { session: null; mfaRequired: true; setCookie: string }
  | null;

export async function resolveTargetAppSession(req: BunRequest, targetAppId: string): Promise<ResolvedTargetAppSession> {
  const direct = await resolveAppSessionForApp(req, targetAppId);
  if (direct) return { session: direct };
  const sso = await tryGroupSsoSession(req, targetAppId);
  if (!sso.ok) return null;
  if (sso.mfaRequired) return { session: null, mfaRequired: true, setCookie: sso.setCookie };
  return { session: { appUserId: sso.appUserId, appId: sso.appId, sessionId: sso.sessionId }, setCookie: sso.setCookie };
}

export function appendSetCookie(headers: Headers, cookie: string | undefined): void {
  if (cookie) headers.append("Set-Cookie", cookie);
}
