import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";

import { runAppLogin } from "../../src/api/lib/app-auth";
import { runLogin } from "../../src/api/auth/service";
import { completeAppEmailVerification } from "../../src/api/lib/app-email-verification";
import {
  finalizeAppPasswordSignIn,
  finalizeConsolePasswordSignIn,
} from "../../src/api/lib/account-lifecycle";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { provisionSiblingAppUser } from "../../src/api/lib/group-sso";
import { hashPassword } from "../../src/api/lib/password";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import {
  captureEmailsForTests,
  getCapturedEmails,
  resetCapturedEmailsForTests,
  restoreEmailDeliveryForTests,
} from "../../src/api/lib/smtp-mail";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;
const ownerPassword = makeStrongPassword();
const appPassword = makeStrongPassword();

function sessionCookie(res: Response): string {
  const raw = (res.headers.getSetCookie?.() ?? []).find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return decodeURIComponent(raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] ?? "");
}

async function setupAndLogin() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(buildRequest("POST", "/api/setup", {
    csrfToken: csrf,
    body: {
      name: "Lifecycle Owner",
      email: "owner-lifecycle@example.com",
      password: ownerPassword,
      passwordConfirm: ownerPassword,
      organizationName: "Lifecycle Test",
    },
  }));
  const loginCsrf = await fetchCsrfToken(dispatchApi);
  const login = await dispatchApi(buildRequest("POST", "/api/auth/login", {
    csrfToken: loginCsrf,
    body: { email: "owner-lifecycle@example.com", password: ownerPassword },
  }));
  return { csrf: loginCsrf, cookie: sessionCookie(login) };
}

run("account lifecycle", () => {
  let csrf = "";
  let cookie = "";
  let appId = "";
  let appUserId = "";
  let ownerId = "";
  let memberId = "";
  const memberPassword = makeStrongPassword();

  beforeAll(async () => {
    captureEmailsForTests();
    await resetTestDatabase();
    resetRateLimitsForTests();
    ({ csrf, cookie } = await setupAndLogin());
    const [owner] = await getDb()`SELECT id FROM users WHERE email = 'owner-lifecycle@example.com'`;
    ownerId = String((owner as { id: string }).id);
    const appRes = await dispatchApi(buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { name: "Lifecycle App", redirectUris: ["https://example.com/callback"], clientType: "confidential" },
    }));
    appId = String(((await appRes.json()) as { app: { id: string } }).app.id);
    const userRes = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { email: "lifecycle-user@example.com", name: "Lifecycle User", password: appPassword, passwordConfirm: appPassword },
    }));
    appUserId = String(((await userRes.json()) as { userId: string }).userId);
  });

  afterAll(async () => {
    restoreEmailDeliveryForTests();
    await closeDatabase();
  });

  async function appAction(action: string, body: Record<string, unknown> = {}) {
    return dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users/${appUserId}/lifecycle/${action}`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body,
    }));
  }

  test("app-user disable, enable, lock, unlock, delete, restore, and permanent delete", async () => {
    const missingCsrf = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users/${appUserId}/lifecycle/disable`, {
      cookies: { [SESSION_COOKIE]: cookie }, body: {},
    }));
    expect(missingCsrf.status).toBe(403);
    const invalidFilter = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users?status=unknown`, {
      cookies: { [SESSION_COOKIE]: cookie },
    }));
    expect(invalidFilter.status).toBe(400);
    const signedIn = await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, appId, "lifecycle-user@example.com", appPassword);
    expect(signedIn.ok).toBe(true);

    expect((await appAction("disable")).status).toBe(200);
    let [row] = await getDb()`SELECT disabled_at FROM app_users WHERE id = ${appUserId}`;
    expect((row as { disabled_at: Date | null }).disabled_at).not.toBeNull();
    const [sessionCount] = await getDb()`SELECT COUNT(*)::int AS n FROM app_user_sessions WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
    expect(Number((sessionCount as { n: number }).n)).toBe(0);
    expect((await appAction("enable")).status).toBe(200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      resetRateLimitsForTests();
      const failed = await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, appId, "lifecycle-user@example.com", "wrong-password");
      expect(failed.ok).toBe(false);
    }
    const detailLocked = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users/${appUserId}`, { cookies: { [SESSION_COOKIE]: cookie } }));
    expect(((await detailLocked.json()) as { status: string }).status).toBe("locked");
    expect((await appAction("unlock")).status).toBe(200);

    expect((await appAction("delete")).status).toBe(200);
    const normalList = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users`, { cookies: { [SESSION_COOKIE]: cookie } }));
    expect(((await normalList.json()) as { users: { userId: string }[] }).users.some((user) => user.userId === appUserId)).toBe(false);
    const deletedList = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users?status=deleted`, { cookies: { [SESSION_COOKIE]: cookie } }));
    expect(((await deletedList.json()) as { users: { userId: string }[] }).users.some((user) => user.userId === appUserId)).toBe(true);
    expect((await appAction("restore")).status).toBe(200);
    const restored = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users/${appUserId}`, { cookies: { [SESSION_COOKIE]: cookie } }));
    expect(((await restored.json()) as { status: string }).status).toBe("disabled");
    expect((await appAction("enable")).status).toBe(200);
    expect((await appAction("delete")).status).toBe(200);
    expect((await appAction("permanently-delete", { confirmationEmail: "wrong@example.com" })).status).toBe(400);
    expect((await appAction("permanently-delete", { confirmationEmail: "lifecycle-user@example.com" })).status).toBe(200);
    [row] = await getDb()`SELECT id FROM app_users WHERE id = ${appUserId}`;
    expect(row).toBeUndefined();
  });

  test("console owner is protected and another member restores as disabled", async () => {
    const ownerDisable = await dispatchApi(buildRequest("POST", `/api/v1/members/${ownerId}/lifecycle/disable`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: {},
    }));
    expect(ownerDisable.status).toBe(409);

    memberId = crypto.randomUUID();
    await getDb().begin(async (tx) => {
      await tx`INSERT INTO users (id, email, name, email_verified_at) VALUES (${memberId}, 'member-lifecycle@example.com', 'Lifecycle Member', NOW())`;
      await tx`INSERT INTO password_credentials (user_id, password_hash) VALUES (${memberId}, ${await hashPassword(memberPassword)})`;
      await tx`INSERT INTO instance_members (user_id) VALUES (${memberId})`;
    });
    const action = (name: string, body: Record<string, unknown> = {}) => dispatchApi(buildRequest("POST", `/api/v1/members/${memberId}/lifecycle/${name}`, {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body,
    }));
    expect((await action("disable")).status).toBe(200);
    expect((await action("enable")).status).toBe(200);
    expect((await action("delete")).status).toBe(200);
    expect((await action("restore")).status).toBe(200);
    const [restored] = await getDb()`SELECT disabled_at, deleted_at FROM users WHERE id = ${memberId}`;
    expect((restored as { disabled_at: Date | null }).disabled_at).not.toBeNull();
    expect((restored as { deleted_at: Date | null }).deleted_at).toBeNull();
  });

  test("console password failures lock the account and an owner can unlock it", async () => {
    const enable = await dispatchApi(buildRequest("POST", `/api/v1/members/${memberId}/lifecycle/enable`, {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body: {},
    }));
    expect(enable.status).toBe(200);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      resetRateLimitsForTests();
      const failed = await runLogin(buildRequest("POST", "/api/auth/login") as BunRequest, "member-lifecycle@example.com", "wrong-password");
      expect(failed.ok).toBe(false);
    }
    const [locked] = await getDb()`SELECT locked_until FROM users WHERE id = ${memberId}`;
    expect(new Date((locked as { locked_until: Date }).locked_until).getTime()).toBeGreaterThan(Date.now());
    const correctWhileLocked = await runLogin(buildRequest("POST", "/api/auth/login") as BunRequest, "member-lifecycle@example.com", memberPassword);
    expect(correctWhileLocked.ok).toBe(false);
    const unlock = await dispatchApi(buildRequest("POST", `/api/v1/members/${memberId}/lifecycle/unlock`, {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body: {},
    }));
    expect(unlock.status).toBe(200);
    resetRateLimitsForTests();
    const correct = await runLogin(buildRequest("POST", "/api/auth/login") as BunRequest, "member-lifecycle@example.com", memberPassword);
    expect(correct.ok).toBe(true);
  });

  test("password-login finalization rejects a lock created after the initial state check", async () => {
    const consoleUserId = crypto.randomUUID();
    const appLoginUserId = crypto.randomUUID();
    await getDb().begin(async (tx) => {
      await tx`
        INSERT INTO users (id, email, name, email_verified_at, locked_until)
        VALUES (${consoleUserId}, 'stale-console-login@example.com', 'Stale Console Login', NOW(), NOW() + INTERVAL '15 minutes')
      `;
      await tx`INSERT INTO instance_members (user_id) VALUES (${consoleUserId})`;
      await tx`
        INSERT INTO app_users (id, app_id, email, name, password_hash, email_verified_at, locked_until)
        VALUES (
          ${appLoginUserId}, ${appId}, 'stale-app-login@example.com', 'Stale App Login',
          ${await hashPassword(appPassword)}, NOW(), NOW() + INTERVAL '15 minutes'
        )
      `;
    });

    let consoleAuthorityCreated = false;
    const consoleResult = await finalizeConsolePasswordSignIn(consoleUserId, async () => {
      consoleAuthorityCreated = true;
      return true;
    });
    expect(consoleResult).toBeNull();
    expect(consoleAuthorityCreated).toBe(false);

    let appAuthorityCreated = false;
    const appResult = await finalizeAppPasswordSignIn(appLoginUserId, appId, async () => {
      appAuthorityCreated = true;
      return true;
    });
    expect(appResult).toBeNull();
    expect(appAuthorityCreated).toBe(false);

    const [consoleState] = await getDb()`SELECT locked_until FROM users WHERE id = ${consoleUserId}`;
    const [appState] = await getDb()`SELECT locked_until FROM app_users WHERE id = ${appLoginUserId}`;
    expect((consoleState as { locked_until: Date | null }).locked_until).not.toBeNull();
    expect((appState as { locked_until: Date | null }).locked_until).not.toBeNull();
  });

  test("group SSO rejects an existing linked target account that is not eligible", async () => {
    const groupId = crypto.randomUUID();
    const groupMemberId = crypto.randomUUID();
    const targetUserId = crypto.randomUUID();
    await getDb().begin(async (tx) => {
      await tx`INSERT INTO service_groups (id, name, slug, sso_enabled) VALUES (${groupId}, 'Lifecycle Group', 'lifecycle-group', true)`;
      await tx`INSERT INTO service_group_members (id, group_id, primary_email) VALUES (${groupMemberId}, ${groupId}, 'linked-target@example.com')`;
      await tx`
        INSERT INTO app_users (id, app_id, email, name, password_hash, email_verified_at, disabled_at)
        VALUES (
          ${targetUserId}, ${appId}, 'linked-target@example.com', 'Linked Target',
          ${await hashPassword(appPassword)}, NOW(), NOW()
        )
      `;
      await tx`
        INSERT INTO service_group_app_users (group_member_id, app_user_id, app_id)
        VALUES (${groupMemberId}, ${targetUserId}, ${appId})
      `;
    });

    const result = await provisionSiblingAppUser({
      targetAppId: appId,
      groupMemberId,
      sourceAppUserId: targetUserId,
    });
    expect(result.ok).toBe(false);
    const [sessionCount] = await getDb()`
      SELECT COUNT(*)::int AS n
      FROM app_user_sessions
      WHERE app_user_id = ${targetUserId} AND revoked_at IS NULL
    `;
    expect(Number((sessionCount as { n: number }).n)).toBe(0);
  });

  test("legacy PATCH disable revokes every pre-disable bearer credential", async () => {
    const patchUserId = crypto.randomUUID();
    await getDb().begin(async (tx) => {
      await tx`
        INSERT INTO app_users (id, app_id, email, name, password_hash, email_verified_at)
        VALUES (
          ${patchUserId}, ${appId}, 'patch-disable@example.com', 'Patch Disable',
          ${await hashPassword(appPassword)}, NOW()
        )
      `;
      await tx`
        INSERT INTO app_password_reset_tokens (app_user_id, app_id, token_hash, expires_at)
        VALUES (${patchUserId}, ${appId}, 'patch-disable-reset', NOW() + INTERVAL '1 hour')
      `;
      await tx`
        INSERT INTO app_email_verification_tokens (app_user_id, app_id, token_hash, expires_at)
        VALUES (${patchUserId}, ${appId}, 'patch-disable-verify', NOW() + INTERVAL '1 hour')
      `;
      await tx`
        INSERT INTO magic_link_tokens (realm, app_id, email, token_hash, expires_at)
        VALUES ('app', ${appId}, 'patch-disable@example.com', 'patch-disable-magic', NOW() + INTERVAL '15 minutes')
      `;
    });

    const response = await dispatchApi(buildRequest(
      "PATCH",
      `/api/v1/apps/${appId}/users/${patchUserId}`,
      {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { membershipStatus: "disabled" },
      },
    ));
    expect(response.status).toBe(200);

    const [resetToken] = await getDb()`SELECT used_at FROM app_password_reset_tokens WHERE token_hash = 'patch-disable-reset'`;
    const [verificationToken] = await getDb()`SELECT used_at FROM app_email_verification_tokens WHERE token_hash = 'patch-disable-verify'`;
    const [magicToken] = await getDb()`SELECT used_at FROM magic_link_tokens WHERE token_hash = 'patch-disable-magic'`;
    expect((resetToken as { used_at: Date | null }).used_at).not.toBeNull();
    expect((verificationToken as { used_at: Date | null }).used_at).not.toBeNull();
    expect((magicToken as { used_at: Date | null }).used_at).not.toBeNull();
  });

  test("verification is single-use and administrator reset sends mail without returning a password", async () => {
    resetCapturedEmailsForTests();
    const put = await dispatchApi(buildRequest("PUT", "/api/v1/settings/email", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { host: "smtp.test", port: 587, encryption: "starttls", username: "user", password: "secret", fromAddress: "noreply@example.com", enabled: true },
    }));
    expect(put.status).toBe(200);
    const verifySmtp = await dispatchApi(buildRequest("POST", "/api/v1/settings/email/test", {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body: { to: "owner-lifecycle@example.com" },
    }));
    expect(verifySmtp.status).toBe(200);

    const userRes = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { email: "verify-user@example.com", name: "Verify User", password: appPassword, passwordConfirm: appPassword },
    }));
    const verifyUserId = String(((await userRes.json()) as { userId: string }).userId);
    await getDb()`UPDATE app_users SET email_verified_at = NULL WHERE id = ${verifyUserId}`;
    resetCapturedEmailsForTests();
    const verification = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users/${verifyUserId}/verification`, {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body: {},
    }));
    expect(verification.status).toBe(200);
    const verificationMail = getCapturedEmails().find((mail) => mail.to === "verify-user@example.com");
    const rawToken = verificationMail?.text.match(/\/auth\/verify-email\/([^\s]+)/)?.[1] ?? "";
    expect(rawToken.length).toBeGreaterThan(20);
    const page = await dispatchWeb(buildRequest("GET", `/auth/verify-email/${rawToken}`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Verify email");
    expect((await completeAppEmailVerification(decodeURIComponent(rawToken))).ok).toBe(true);
    expect((await completeAppEmailVerification(decodeURIComponent(rawToken))).ok).toBe(false);

    resetCapturedEmailsForTests();
    const reset = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users/${verifyUserId}/password-reset`, {
      csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body: {},
    }));
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ ok: true });
    expect(getCapturedEmails().some((mail) => mail.to === "verify-user@example.com" && mail.text.includes("reset-password"))).toBe(true);
  });
});
