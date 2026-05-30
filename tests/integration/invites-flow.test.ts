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
const bobPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function inviteTokenFromUrl(url: string): string {
  return new URL(url).pathname.split("/").pop() ?? "";
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

async function createSecondTenant(adminUserId: string): Promise<string> {
  const slug = `beta-${crypto.randomUUID().slice(0, 8)}`;
  const [tenant] = await getDb()`
    INSERT INTO tenants (name, slug, is_default)
    VALUES ('Beta Org', ${slug}, false)
    RETURNING id
  `;
  const tenantId = String((tenant as { id: string }).id);
  await getDb()`
    INSERT INTO tenant_memberships (user_id, tenant_id, role)
    VALUES (${adminUserId}, ${tenantId}, 'tenant_admin')
  `;
  await assignTenantRole(adminUserId, tenantId, "tenant_admin");
  return tenantId;
}

run("invite flow", () => {
  let tenantId = "";
  let adminUserId = "";
  let inviteUrl = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { res } = await login("admin@example.com", adminPassword);
    const body = (await res.json()) as { tenant?: { id: string }; user?: { id: string } };
    tenantId = body.tenant?.id ?? "";
    adminUserId = body.user?.id ?? "";
    expect(tenantId).toBeTruthy();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("admin creates invite for new user", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const { cookie } = await login("admin@example.com", adminPassword);
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie! },
        body: {
          email: "bob@example.com",
          invitedName: "Bob Example",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { inviteUrl: string; email: string };
    expect(data.email).toBe("bob@example.com");
    inviteUrl = data.inviteUrl;
  });

  test("preview shows new account path", async () => {
    const token = inviteTokenFromUrl(inviteUrl);
    const res = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await res.json()) as { status: string; accountExists: boolean };
    expect(preview.status).toBe("pending");
    expect(preview.accountExists).toBe(false);
  });

  test("new user accepts invite and gets session", async () => {
    const token = inviteTokenFromUrl(inviteUrl);
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: csrf,
        body: {
          name: "Bob Example",
          password: bobPassword,
          passwordConfirm: bobPassword,
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(sessionCookieFromResponse(res)).toBeDefined();
  });

  test("bob is a member after accept", async () => {
    const { res, cookie } = await login("bob@example.com", bobPassword);
    expect(res.status).toBe(200);
    const csrf = await fetchCsrfToken(dispatchApi);
    const membersRes = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${tenantId}/members`, {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(membersRes.status).toBe(403);

    const admin = await login("admin@example.com", adminPassword);
    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${tenantId}/members`, {
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    expect(listRes.status).toBe(200);
    const { members } = (await listRes.json()) as { members: { email: string }[] };
    expect(members.some((m) => m.email === "bob@example.com")).toBe(true);
  });

  test("existing user must sign in before accept", async () => {
    const betaTenantId = await createSecondTenant(adminUserId);
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${betaTenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "bob@example.com",
          invitedName: "Bob Example",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl: betaInviteUrl } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(betaInviteUrl);

    const previewRes = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await previewRes.json()) as { accountExists: boolean };
    expect(preview.accountExists).toBe(true);

    const unauthAccept = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {},
      }),
    );
    expect(unauthAccept.status).toBe(401);
  });

  test("existing user accepts after sign-in", async () => {
    const betaTenantId = await createSecondTenant(adminUserId);
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${betaTenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "bob@example.com",
          invitedName: "Bob",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    const { inviteUrl: betaInviteUrl } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(betaInviteUrl);

    const bob = await login("bob@example.com", bobPassword);
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: bob.cookie! },
        body: {},
      }),
    );
    expect(acceptRes.status).toBe(200);

    const member = await getDb()`
      SELECT 1 FROM tenant_memberships
      WHERE user_id = (SELECT id FROM users WHERE email = 'bob@example.com')
        AND tenant_id = ${betaTenantId}
    `;
    expect(member.length).toBe(1);
  });

  test("decline without account", async () => {
    const betaTenantId = await createSecondTenant(adminUserId);
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${betaTenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "helen@example.com",
          invitedName: "Helen",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    const { inviteUrl: helenUrl } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(helenUrl);

    const declineRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/decline`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {},
      }),
    );
    expect(declineRes.status).toBe(200);

    const previewRes = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await previewRes.json()) as { status: string };
    expect(preview.status).toBe("declined");
  });

  test("duplicate pending invite returns 409", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const body = {
      email: "dup@example.com",
      invitedName: "Dup User",
      roleKeys: ["tenant_member"],
    };
    const first = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body,
      }),
    );
    expect(first.status).toBe(201);

    const second = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body,
      }),
    );
    expect(second.status).toBe(409);
  });

  test("member without invite permission gets 403", async () => {
    const bob = await login("bob@example.com", bobPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: bob.cookie! },
        body: {
          email: "blocked@example.com",
          invitedName: "Blocked",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("admin revokes pending invite", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "revoke-me@example.com",
          invitedName: "Revoke Me",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { id, inviteUrl: url } = (await createRes.json()) as { id: string; inviteUrl: string };
    const token = inviteTokenFromUrl(url);

    const revokeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/tenants/${tenantId}/invites/${id}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    expect(revokeRes.status).toBe(200);

    const previewRes = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await previewRes.json()) as { status: string };
    expect(preview.status).toBe("revoked");
  });

  test("expired invite cannot be accepted", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "expired@example.com",
          invitedName: "Expired User",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl: url } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(url);

    await getDb()`
      UPDATE tenant_invites
      SET expires_at = NOW() - INTERVAL '1 hour'
      WHERE email = 'expired@example.com' AND tenant_id = ${tenantId}
    `;

    const previewRes = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await previewRes.json()) as { status: string };
    expect(preview.status).toBe("expired");

    const expiredPassword = makeStrongPassword();
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {
          name: "Expired User",
          password: expiredPassword,
          passwordConfirm: expiredPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(409);
  });

  test("admin updates member roles and removes member", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "carol@example.com",
          invitedName: "Carol Example",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl: carolUrl } = (await createRes.json()) as { inviteUrl: string };
    const carolToken = inviteTokenFromUrl(carolUrl);
    const carolPassword = makeStrongPassword();

    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${carolToken}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {
          name: "Carol Example",
          password: carolPassword,
          passwordConfirm: carolPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);

    const [carolRow] = await getDb()`SELECT id FROM users WHERE email = 'carol@example.com'`;
    const carolUserId = String((carolRow as { id: string }).id);

    const patchRes = await dispatchApi(
      buildRequest("PATCH", `/api/v1/tenants/${tenantId}/members/${carolUserId}/roles`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: { roleKeys: ["tenant_manager"] },
      }),
    );
    expect(patchRes.status).toBe(200);

    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${tenantId}/members`, {
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    const { members } = (await listRes.json()) as { members: { email: string; roleKeys: string[] }[] };
    const carol = members.find((m) => m.email === "carol@example.com");
    expect(carol?.roleKeys).toContain("tenant_manager");

    const removeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/tenants/${tenantId}/members/${carolUserId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    expect(removeRes.status).toBe(200);

    const afterRemove = await dispatchApi(
      buildRequest("GET", `/api/v1/tenants/${tenantId}/members`, {
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    const { members: afterMembers } = (await afterRemove.json()) as { members: { email: string }[] };
    expect(afterMembers.some((m) => m.email === "carol@example.com")).toBe(false);
  });
});
