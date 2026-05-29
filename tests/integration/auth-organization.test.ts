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
});

afterAll(async () => {
  await closeDatabase();
});
