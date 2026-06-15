import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const viewerPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Owner User",
        email: "owner@example.com",
        password: ownerPassword,
        passwordConfirm: ownerPassword,
        organizationName: "RBAC Corp",
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

run("platform RBAC (P1)", () => {
  let viewerRoleId = "";
  let inviteUrl = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("owner session includes scopes and owner role", async () => {
    const { cookie } = await login("owner@example.com", ownerPassword);
    const meRes = await dispatchApi(
      buildRequest("GET", "/api/v1/me", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as { scopes: string[]; roles: string[]; isBootstrap: boolean };
    expect(me.isBootstrap).toBe(true);
    expect(me.scopes).toContain("members:invite");
    expect(me.roles).toContain("Owner");
  });

  test("lists system roles", async () => {
    const { cookie } = await login("owner@example.com", ownerPassword);
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/rbac/roles", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(res.status).toBe(200);
    const { roles } = (await res.json()) as { roles: { key: string; name: string }[] };
    expect(roles.some((role) => role.key === "viewer")).toBe(true);
    viewerRoleId = roles.find((role) => role.key === "viewer")!.id as unknown as string;
    expect(viewerRoleId).toBeTruthy();
  });

  test("invite with viewer role", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const { cookie } = await login("owner@example.com", ownerPassword);
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie! },
        body: {
          email: "viewer@example.com",
          invitedName: "View Only",
          roleIds: [viewerRoleId],
        },
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { inviteUrl: string; roles: { name: string }[] };
    expect(data.roles[0]?.name).toBe("Viewer");
    inviteUrl = data.inviteUrl;
  });

  test("viewer accepts invite and cannot create apps", async () => {
    const token = new URL(inviteUrl).pathname.split("/").pop() ?? "";
    const csrf = await fetchCsrfToken(dispatchApi);
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: csrf,
        body: {
          name: "View Only",
          password: viewerPassword,
          passwordConfirm: viewerPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);

    const { cookie } = await login("viewer@example.com", viewerPassword);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie! },
        body: { name: "Blocked App", redirectUris: ["https://example.com/callback"], clientType: "confidential" },
      }),
    );
    expect(createRes.status).toBe(403);

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/apps", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(listRes.status).toBe(200);
  });
});
