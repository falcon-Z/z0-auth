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

run("invite flow", () => {
  let inviteUrl = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("member creates invite for new user", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const { cookie } = await login("admin@example.com", adminPassword);

    const missingCsrf = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        cookies: { [SESSION_COOKIE]: cookie! },
        body: {
          email: "csrf-missing@example.com",
          invitedName: "Missing CSRF",
        },
      }),
    );
    expect(missingCsrf.status).toBe(403);

    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie! },
        body: {
          email: "bob@example.com",
          invitedName: "Bob Example",
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
    const preview = (await res.json()) as { status: string; accountExists: boolean; organizationName: string };
    expect(preview.status).toBe("pending");
    expect(preview.accountExists).toBe(false);
    expect(preview.organizationName).toBe("Acme Corp");
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

  test("bob is an instance member after accept", async () => {
    const { cookie } = await login("bob@example.com", bobPassword);
    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/members", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(listRes.status).toBe(200);
    const { members } = (await listRes.json()) as { members: { email: string }[] };
    expect(members.some((m) => m.email === "bob@example.com")).toBe(true);
  });

  test("cannot invite existing member", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: { email: "bob@example.com", invitedName: "Bob" },
      }),
    );
    expect(res.status).toBe(409);
  });

  test("existing non-member must provide password to accept", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: { email: "zoe@example.com", invitedName: "Zoe" },
      }),
    );
    expect(createRes.status).toBe(201);
    const token = inviteTokenFromUrl((await createRes.json() as { inviteUrl: string }).inviteUrl);

    const zoePassword = makeStrongPassword();
    const { hashPassword } = await import("../../src/api/lib/password");
    const hash = await hashPassword(zoePassword);
    await getDb().begin(async (tx) => {
      const [user] = await tx`
        INSERT INTO users (email, name, email_verified_at)
        VALUES ('zoe@example.com', 'Zoe', NOW())
        RETURNING id
      `;
      await tx`
        INSERT INTO password_credentials (user_id, password_hash)
        VALUES (${String((user as { id: string }).id)}, ${hash})
      `;
    });

    const unauthAccept = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {},
      }),
    );
    expect(unauthAccept.status).toBe(400);

    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {
          name: "Zoe",
          password: zoePassword,
          passwordConfirm: zoePassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);
    expect(sessionCookieFromResponse(acceptRes)).toBeDefined();
  });

  test("duplicate pending invite returns 409", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const body = {
      email: "dup@example.com",
      invitedName: "Dup User",
    };
    const first = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body,
      }),
    );
    expect(first.status).toBe(201);

    const second = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body,
      }),
    );
    expect(second.status).toBe(409);
  });

  test("member revokes pending invite", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "revoke-me@example.com",
          invitedName: "Revoke Me",
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { id, inviteUrl: url } = (await createRes.json()) as { id: string; inviteUrl: string };
    const token = inviteTokenFromUrl(url);

    const revokeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/members/invites/${id}`, {
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
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "expired@example.com",
          invitedName: "Expired User",
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl: url } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(url);

    await getDb()`
      UPDATE instance_invites
      SET expires_at = NOW() - INTERVAL '1 hour'
      WHERE email = 'expired@example.com'
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

  test("admin removes member", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const [bobRow] = await getDb()`SELECT id FROM users WHERE email = 'bob@example.com'`;
    const bobUserId = String((bobRow as { id: string }).id);

    const removeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/members/${bobUserId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    expect(removeRes.status).toBe(200);

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/members", {
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    const { members } = (await listRes.json()) as { members: { email: string }[] };
    expect(members.some((m) => m.email === "bob@example.com")).toBe(false);
  });

  test("re-invited removed member can accept via setup form", async () => {
    const admin = await login("admin@example.com", adminPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
        body: {
          email: "bob@example.com",
          invitedName: "Bob Example",
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const token = inviteTokenFromUrl((await createRes.json() as { inviteUrl: string }).inviteUrl);

    const previewRes = await dispatchApi(buildRequest("GET", `/api/v1/invites/${token}`));
    const preview = (await previewRes.json()) as { accountExists: boolean };
    expect(preview.accountExists).toBe(false);

    const newPassword = makeStrongPassword();
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: await fetchCsrfToken(dispatchApi),
        body: {
          name: "Bob Example",
          password: newPassword,
          passwordConfirm: newPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);
    expect(sessionCookieFromResponse(acceptRes)).toBeDefined();

    const bob = await login("bob@example.com", newPassword);
    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/members", {
        cookies: { [SESSION_COOKIE]: bob.cookie! },
      }),
    );
    expect(listRes.status).toBe(200);
  });

  test("cannot remove instance owner", async () => {
    const admin = await login("admin@example.com", adminPassword);
    expect(admin.res.status).toBe(200);
    const csrf = await fetchCsrfToken(dispatchApi);
    const [adminRow] = await getDb()`SELECT id FROM users WHERE email = 'admin@example.com'`;
    const adminUserId = String((adminRow as { id: string }).id);

    const removeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/members/${adminUserId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: admin.cookie! },
      }),
    );
    expect(removeRes.status).toBe(409);
  });
});
