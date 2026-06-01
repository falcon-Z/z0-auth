import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const adminPassword = makeStrongPassword();
const managerPassword = makeStrongPassword();

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

async function login(email: string, password: string) {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email, password },
    }),
  );
  return { res, csrf, cookie: sessionCookieFromResponse(res) };
}

run("RBAC alignment", () => {
  let tenantId = "";
  let adminCookie = "";
  let adminUserId = "";
  let managerCookie = "";
  let managerUserId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const adminLogin = await login("admin@example.com", adminPassword);
    adminCookie = adminLogin.cookie ?? "";
    const adminSessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    adminUserId = ((await adminSessionRes.json()) as { user: { id: string } }).user.id;

    const [tenant] = await getDb()`SELECT id FROM tenants LIMIT 1`;
    tenantId = String((tenant as { id: string }).id);

    const csrf = await fetchCsrfToken(dispatchApi);
    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: {
          email: "manager@example.com",
          invitedName: "Org Manager",
          roleKeys: ["tenant_manager"],
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
          name: "Org Manager",
          password: managerPassword,
          passwordConfirm: managerPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);

    const managerLogin = await login("manager@example.com", managerPassword);
    managerCookie = managerLogin.cookie ?? "";
    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(managerCookie)),
    );
    const session = (await sessionRes.json()) as { user: { id: string }; permissions?: string[] };
    managerUserId = session.user.id;
    expect(session.permissions).toContain("users:invite");
    expect(session.permissions).not.toContain("platform:users:read");
  });

  afterAll(() => {
    closeDatabase();
  });

  test("platform manager can read but not write platform users", async () => {
    await getDb()`
      INSERT INTO platform_memberships (user_id, role)
      VALUES (${managerUserId}, 'platform_manager')
      ON CONFLICT DO NOTHING
    `;
    await getDb()`
      INSERT INTO user_roles (user_id, role_id, tenant_id)
      SELECT ${managerUserId}, r.id, NULL
      FROM roles r
      WHERE r.key = 'platform_manager' AND r.scope = 'platform'
      ON CONFLICT DO NOTHING
    `;

    try {
      const { cookie, csrf } = await login("manager@example.com", managerPassword);

      const listRes = await dispatchApi(
        buildRequest("GET", "/api/v1/users", withSession(cookie)),
      );
      expect(listRes.status).toBe(200);

      const sessionRes = await dispatchApi(
        buildRequest("GET", "/api/auth/session", withSession(cookie)),
      );
      const session = (await sessionRes.json()) as { permissions: string[] };
      expect(session.permissions).toContain("platform:users:read");
      expect(session.permissions).not.toContain("platform:users:write");

      const [adminRow] = await getDb()`SELECT id FROM users WHERE lower(email) = 'admin@example.com'`;
      const adminId = String((adminRow as { id: string }).id);

      const patchRes = await dispatchApi(
        buildRequest("PATCH", `/api/v1/users/${adminId}`, {
          csrfToken: csrf,
          ...withSession(cookie),
          body: { status: "disabled" },
        }),
      );
      expect(patchRes.status).toBe(403);
    } finally {
      await getDb()`
        DELETE FROM user_roles ur
        USING roles r
        WHERE ur.user_id = ${managerUserId}
          AND ur.role_id = r.id
          AND r.key = 'platform_manager'
          AND r.scope = 'platform'
          AND ur.tenant_id IS NULL
      `;
      await getDb()`
        DELETE FROM platform_memberships
        WHERE user_id = ${managerUserId} AND role = 'platform_manager'
      `;
    }
  });

  test("tenant manager cannot invite as tenant_admin", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        ...withSession(managerCookie),
        body: {
          email: "blocked@example.com",
          invitedName: "Blocked Admin",
          roleKeys: ["tenant_admin"],
        },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "role_assignment_denied")).toBe(true);
  });

  test("cannot demote last tenant admin in an organization", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Solo Org", slug: "solo-org-m5", joinAsAdmin: true },
      }),
    );
    expect(createRes.status).toBe(201);
    const { tenant } = (await createRes.json()) as { tenant: { id: string } };

    const patchRes = await dispatchApi(
      buildRequest("PATCH", `/api/v1/tenants/${tenant.id}/members/${adminUserId}/roles`, {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { roleKeys: ["tenant_member"] },
      }),
    );
    expect(patchRes.status).toBe(403);
    const body = (await patchRes.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "last_tenant_admin")).toBe(true);
  });

  test("session includes permissions array for admin", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const session = (await res.json()) as { permissions: string[] };
    expect(session.permissions).toContain("platform:users:write");
    expect(session.permissions).toContain("tenants:create");
    expect(session.permissions).not.toContain("platform:manage");
  });
});
