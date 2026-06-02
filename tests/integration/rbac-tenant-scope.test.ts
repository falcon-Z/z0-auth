import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { assignTenantRole } from "../../src/api/lib/roles";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const adminPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function withSession(cookie?: string): { cookies?: Record<string, string> } {
  if (!cookie) return {};
  return { cookies: { [SESSION_COOKIE]: cookie } };
}

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Admin User",
        email: "admin@example.com",
        password: adminPassword,
        passwordConfirm: adminPassword,
        organizationName: "Acme Corp",
      },
    }),
  );
}

async function login() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "admin@example.com", password: adminPassword },
    }),
  );
  return sessionCookieFromResponse(res);
}

run("RBAC tenant scope for platform admin", () => {
  let adminCookie = "";
  let defaultTenantId = "";
  let memberOnlyTenantId = "";
  let noMembershipTenantId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    adminCookie = (await login()) ?? "";

    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const sessionBody = (await sessionRes.json()) as { tenant: { id: string }; user: { id: string } };
    defaultTenantId = sessionBody.tenant.id;
    const adminUserId = sessionBody.user.id;

    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Member Only Org", slug: "member-only-org" },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { tenant: { id: string } };
    memberOnlyTenantId = created.tenant.id;

    const noMemberRes = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "No Membership Org", slug: "no-membership-org" },
      }),
    );
    expect(noMemberRes.status).toBe(201);
    noMembershipTenantId = ((await noMemberRes.json()) as { tenant: { id: string } }).tenant.id;

    await getDb()`
      INSERT INTO tenant_memberships (user_id, tenant_id, role)
      VALUES (${adminUserId}, ${memberOnlyTenantId}, 'tenant_member')
    `;
    await assignTenantRole(adminUserId, memberOnlyTenantId, "tenant_member");

    const switchRes = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { tenantId: memberOnlyTenantId },
      }),
    );
    expect(switchRes.status).toBe(200);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("platform admin sees all tenants in directory list", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/tenants", withSession(adminCookie)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenants: { id: string }[] };
    expect(body.tenants.length).toBeGreaterThanOrEqual(2);
    expect(body.tenants.some((t) => t.id === memberOnlyTenantId)).toBe(true);
  });

  test("session on member-only org includes tenant management via platform override", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const body = (await res.json()) as {
      tenant?: { id: string };
      tenantRoles?: string[];
      permissions?: string[];
    };
    expect(body.tenant?.id).toBe(memberOnlyTenantId);
    expect(body.tenantRoles).toEqual(["tenant_member"]);
    expect(body.permissions).toBeDefined();
    expect(body.permissions).toContain("users:invite");
    expect(body.permissions).toContain("users:read");
    expect(body.permissions).toContain("platform:tenants:manage");
  });

  test("cannot switch active tenant to org without membership", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/auth/active-tenant", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { tenantId: noMembershipTenantId },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("can create invite on member-only org via platform override", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${memberOnlyTenantId}/invites`, {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: {
          email: "blocked-invite@example.com",
          invitedName: "Blocked",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  test("session still includes tenants:read for tenant_member on active org", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const body = (await res.json()) as { permissions?: string[] };
    expect(body.permissions).toContain("tenants:read");
    expect(body.permissions).toContain("platform:tenants:read");
  });

  test("can list members and invites on member-only org via platform override", async () => {
    const membersRes = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${memberOnlyTenantId}/members`, withSession(adminCookie)),
    );
    expect(membersRes.status).toBe(200);

    const invitesRes = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${memberOnlyTenantId}/invites`, withSession(adminCookie)),
    );
    expect(invitesRes.status).toBe(200);
  });

  test("console summary includes tenant metrics with platform override", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/console/summary", withSession(adminCookie)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenant?: { memberCount: number };
      platform?: { tenantCount?: number; userCount?: number };
    };
    expect(body.tenant?.memberCount).toBeGreaterThanOrEqual(1);
    expect(body.platform?.tenantCount).toBeGreaterThanOrEqual(2);
    expect(body.platform?.userCount).toBeGreaterThanOrEqual(1);
  });
});
