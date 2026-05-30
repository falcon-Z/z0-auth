import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const adminPassword = makeStrongPassword();
const inviteePassword = makeStrongPassword();

function extractCsrfFromHtml(html: string): string | undefined {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  return match?.[1];
}

function extractCsrfFromSetCookie(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  const match = raw?.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function inviteTokenFromUrl(url: string): string {
  return new URL(url).pathname.split("/").pop() ?? "";
}

async function completeSetup() {
  const csrfRes = await dispatchWeb(new Request("http://localhost/auth/setup"));
  const csrf = extractCsrfFromSetCookie(csrfRes) ?? extractCsrfFromHtml(await csrfRes.text());
  if (!csrf) throw new Error("setup CSRF missing");

  await dispatchWeb(
    new Request("http://localhost/auth/setup", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrf)}`,
      },
      body: new URLSearchParams({
        _csrf: csrf,
        name: "Admin User",
        email: "admin@example.com",
        password: adminPassword,
        passwordConfirm: adminPassword,
        organizationName: "Acme Corp",
      }).toString(),
    }),
  );
}

run("invite HTML flow", () => {
  let tenantId = "";
  let inviteToken = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const csrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "admin@example.com", password: adminPassword },
      }),
    );
    const loginBody = (await loginRes.json()) as { tenant?: { id: string } };
    tenantId = loginBody.tenant?.id ?? "";

    const sessionCookie = loginRes.headers.getSetCookie?.().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const cookie = sessionCookie?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    if (!cookie) throw new Error("session cookie missing");

    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: decodeURIComponent(cookie) },
        body: {
          email: "html-invitee@example.com",
          invitedName: "HTML Invitee",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl } = (await createRes.json()) as { inviteUrl: string };
    inviteToken = inviteTokenFromUrl(inviteUrl);
    expect(inviteToken).toBeTruthy();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("GET /auth/invite/:token shows new-user accept form", async () => {
    const res = await dispatchWeb(new Request(`http://localhost/auth/invite/${inviteToken}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Create your account");
    expect(html).toContain("html-invitee@example.com");
    expect(html).toContain('name="password"');
    expect(html).toContain("Accept and create account");
  });

  test("POST /auth/invite/:token accepts invite and redirects", async () => {
    const pageRes = await dispatchWeb(new Request(`http://localhost/auth/invite/${inviteToken}`));
    const html = await pageRes.text();
    const csrf = extractCsrfFromHtml(html)!;
    const csrfCookie = extractCsrfFromSetCookie(pageRes) ?? csrf;

    const acceptRes = await dispatchWeb(
      new Request(`http://localhost/auth/invite/${inviteToken}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrfCookie)}`,
        },
        body: new URLSearchParams({
          _csrf: csrf,
          intent: "accept",
          name: "HTML Invitee",
          password: inviteePassword,
          passwordConfirm: inviteePassword,
        }).toString(),
      }),
    );

    expect(acceptRes.status).toBe(303);
    expect(acceptRes.headers.get("location")).toBe("/");
    expect(acceptRes.headers.getSetCookie?.().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
  });
});
