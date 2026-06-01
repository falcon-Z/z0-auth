import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const adminPassword = makeStrongPassword();
const memberPassword = makeStrongPassword();

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

run("organizations API", () => {
  let adminCookie = "";
  let memberCookie = "";
  let defaultTenantId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const adminLogin = await login("admin@example.com", adminPassword);
    expect(adminLogin.res.status).toBe(200);
    adminCookie = adminLogin.cookie ?? "";

    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const session = (await sessionRes.json()) as { tenant: { id: string } };
    defaultTenantId = session.tenant.id;

    const csrf = await fetchCsrfToken(dispatchApi);
    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${defaultTenantId}/invites`, {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: {
          email: "member@example.com",
          invitedName: "Member User",
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
          name: "Member User",
          password: memberPassword,
          passwordConfirm: memberPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);

    const memberLogin = await login("member@example.com", memberPassword);
    memberCookie = memberLogin.cookie ?? "";
  });

  afterAll(() => {
    closeDatabase();
  });

  test("lists organizations for a member", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/tenants", withSession(memberCookie)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenants: { slug: string }[] };
    expect(body.tenants.some((t) => t.slug.includes("acme"))).toBe(true);
  });

  test("denies create without tenants:create", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(memberCookie),
        body: { name: "Blocked Org", slug: "blocked-org" },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("creates organization without joining", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Beta Org", slug: "beta-org" },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { tenant: { id: string; slug: string } };
    expect(created.tenant.slug).toBe("beta-org");

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/tenants", withSession(adminCookie)),
    );
    const list = (await listRes.json()) as { tenants: { id: string }[] };
    expect(list.tenants.some((t) => t.id === created.tenant.id)).toBe(true);

    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(adminCookie)),
    );
    const session = (await sessionRes.json()) as { organizations: { id: string }[] };
    expect(session.organizations.some((t) => t.id === created.tenant.id)).toBe(false);
  });

  test("creates organization with joinAsAdmin", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Gamma Org", slug: "gamma-org", joinAsAdmin: true },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { tenant: { id: string } };

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/tenants", withSession(adminCookie)),
    );
    const list = (await listRes.json()) as { tenants: { id: string }[] };
    expect(list.tenants.some((t) => t.id === created.tenant.id)).toBe(true);
  });

  test("rejects invalid slug", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Bad Slug Org", slug: "Bad_Slug" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: { field: string; code: string }[] };
    expect(body.errors.some((e) => e.field === "slug" && e.code === "invalid_slug")).toBe(true);
  });

  test("rejects duplicate slug", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/tenants", {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: { name: "Another Beta", slug: "beta-org" },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { field: string; code: string }[] };
    expect(body.errors.some((e) => e.code === "slug_taken")).toBe(true);
  });
});
