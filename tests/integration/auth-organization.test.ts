import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { uniqueTenantSlug } from "../../src/api/lib/tenant";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = makeStrongPassword();
const email = "org-switch@example.com";

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Org Admin",
        email,
        password: strongPassword,
        passwordConfirm: strongPassword,
        organizationName: "Primary Org",
      },
    }),
  );
  return csrf;
}

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function login(): Promise<string> {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email, password: strongPassword },
    }),
  );
  expect(res.status).toBe(200);
  return sessionCookieFromResponse(res)!;
}

async function addSecondOrganization(userId: string): Promise<string> {
  const db = getDb();
  const slug = await uniqueTenantSlug("Secondary Org", db);
  const [tenant] = await db`
    INSERT INTO tenants (name, slug, is_default)
    VALUES ('Secondary Org', ${slug}, false)
    RETURNING id
  `;
  const tenantId = String((tenant as { id: string }).id);
  await db`
    INSERT INTO tenant_memberships (user_id, tenant_id, role)
    VALUES (${userId}, ${tenantId}, 'tenant_member')
  `;
  const [role] = await db`
    SELECT id FROM roles WHERE key = 'tenant_member' AND scope = 'tenant'
  `;
  await db`
    INSERT INTO user_roles (user_id, role_id, tenant_id)
    VALUES (${userId}, ${(role as { id: string }).id}, ${tenantId})
    ON CONFLICT DO NOTHING
  `;
  return tenantId;
}

run("organization context", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  test("single org: cannot switch yet", async () => {
    const token = await login();
    const res = await dispatchApi(
      buildRequest("GET", "/api/auth/session", {
        cookies: { [SESSION_COOKIE]: token },
      }),
    );
    const session = (await res.json()) as SessionResponse;
    expect(session.authenticated).toBe(true);
    expect(session.organizations?.length).toBe(1);
    expect(session.canSwitchOrganization).toBe(false);
    expect(session.tenantRoles).toContain("tenant_admin");
  });

  test("multi org: can switch active organization", async () => {
    const token = await login();
    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", {
        cookies: { [SESSION_COOKIE]: token },
      }),
    );
    const before = (await sessionRes.json()) as SessionResponse;
    const userId = before.user!.id;
    const primaryTenantId = before.tenant!.id;

    const secondaryTenantId = await addSecondOrganization(userId);

    const afterJoin = await dispatchApi(
      buildRequest("GET", "/api/auth/session", {
        cookies: { [SESSION_COOKIE]: token },
      }),
    );
    const joined = (await afterJoin.json()) as SessionResponse;
    expect(joined.canSwitchOrganization).toBe(true);
    expect(joined.organizations?.length).toBe(2);

    const csrf = await fetchCsrfToken(dispatchApi);
    const switchRes = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: token },
        body: { tenantId: secondaryTenantId },
      }),
    );
    expect(switchRes.status).toBe(200);
    const switched = (await switchRes.json()) as SessionResponse;
    expect(switched.tenant?.id).toBe(secondaryTenantId);
    expect(switched.tenantRoles).toContain("tenant_member");

    const denyRes = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: token },
        body: { tenantId: crypto.randomUUID() },
      }),
    );
    expect(denyRes.status).toBe(403);

    const backRes = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: token },
        body: { tenantId: primaryTenantId },
      }),
    );
    expect(backRes.status).toBe(200);
    const back = (await backRes.json()) as SessionResponse;
    expect(back.tenant?.id).toBe(primaryTenantId);
    expect(back.tenantRoles).toContain("tenant_admin");
  });

  test("tenant-only user permissions follow active tenant roles", async () => {
    const adminToken = await login();
    const adminSessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", { cookies: { [SESSION_COOKIE]: adminToken } }),
    );
    const adminSession = (await adminSessionRes.json()) as SessionResponse;
    const primaryTenantId = adminSession.tenant!.id;

    const memberEmail = "member-roles@example.com";
    const memberPassword = makeStrongPassword();
    const csrf = await fetchCsrfToken(dispatchApi);
    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${primaryTenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: adminToken },
        body: {
          email: memberEmail,
          invitedName: "Role Test Member",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(inviteRes.status).toBe(201);
    const invite = (await inviteRes.json()) as { inviteUrl: string };
    const token = new URL(invite.inviteUrl).pathname.split("/").pop() ?? "";
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: csrf,
        body: {
          name: "Role Test Member",
          password: memberPassword,
          passwordConfirm: memberPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);

    const memberLogin = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: memberEmail, password: memberPassword },
      }),
    );
    expect(memberLogin.status).toBe(200);
    const memberCookie = sessionCookieFromResponse(memberLogin)!;

    const memberSessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", { cookies: { [SESSION_COOKIE]: memberCookie } }),
    );
    const memberSession = (await memberSessionRes.json()) as SessionResponse;
    const memberUserId = memberSession.user!.id;
    expect(memberSession.permissions).toEqual(["tenants:read"]);

    const secondaryTenantId = await addSecondOrganization(memberUserId);
    const [adminRole] = await getDb()`
      SELECT id FROM roles WHERE key = 'tenant_admin' AND scope = 'tenant'
    `;
    await getDb()`
      DELETE FROM user_roles
      WHERE user_id = ${memberUserId} AND tenant_id = ${secondaryTenantId}
    `;
    await getDb()`
      INSERT INTO user_roles (user_id, role_id, tenant_id)
      VALUES (${memberUserId}, ${(adminRole as { id: string }).id}, ${secondaryTenantId})
    `;
    await getDb()`
      UPDATE tenant_memberships
      SET role = 'tenant_admin'
      WHERE user_id = ${memberUserId} AND tenant_id = ${secondaryTenantId}
    `;

    const onAdminTenant = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: memberCookie },
        body: { tenantId: secondaryTenantId },
      }),
    );
    const adminCtx = (await onAdminTenant.json()) as SessionResponse;
    expect(adminCtx.tenantRoles).toContain("tenant_admin");
    expect(adminCtx.permissions).toContain("users:read");
    expect(adminCtx.permissions).not.toContain("platform:users:read");

    const onMemberTenant = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: memberCookie },
        body: { tenantId: primaryTenantId },
      }),
    );
    const memberCtx = (await onMemberTenant.json()) as SessionResponse;
    expect(memberCtx.tenantRoles).toEqual(["tenant_member"]);
    expect(memberCtx.permissions).toEqual(["tenants:read"]);
    expect(memberCtx.permissions).not.toContain("users:read");
  });
});

afterAll(async () => {
  await closeDatabase();
});
