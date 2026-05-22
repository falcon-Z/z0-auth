import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { closeDatabase } from "../../packages/server/src/api/lib/db";
import { resetRateLimitsForTests } from "../../packages/server/src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";

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

async function fetchSetupCsrf(): Promise<string> {
  const res = await dispatchWeb(new Request("http://localhost/setup"));
  const fromCookie = extractCsrfFromSetCookie(res);
  if (fromCookie) return fromCookie;
  const html = await res.text();
  const fromHtml = extractCsrfFromHtml(html);
  if (!fromHtml) throw new Error("CSRF token missing on setup page");
  return fromHtml;
}

run("web auth pages", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    resetRateLimitsForTests();
  });

  test("GET /setup returns HTML form", async () => {
    const res = await dispatchWeb(new Request("http://localhost/setup"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Platform setup");
    expect(html).toContain('name="organizationName"');
    expect(html).toContain('data-validate');
    expect(html).toContain("/static/auth-forms.js");
    expect(html).toContain("data-msg-required");
  });

  test("GET /static/auth-forms.js is served", async () => {
    const res = await dispatchWeb(new Request("http://localhost/static/auth-forms.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  test("POST /setup redirects to login", async () => {
    const csrf = await fetchSetupCsrf();
    const body = new URLSearchParams({
      _csrf: csrf,
      organizationName: "Acme IAM",
      name: "Super Admin",
      email: "admin@example.com",
      password: strongPassword,
      passwordConfirm: strongPassword,
    });

    const res = await dispatchWeb(
      new Request("http://localhost/setup", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrf)}`,
        },
        body: body.toString(),
      }),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("setup=complete");
  });

  test("GET /login redirects to /setup when incomplete", async () => {
    await resetTestDatabase();
    const res = await dispatchWeb(new Request("http://localhost/login"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/setup");
  });

  test("GET /login shows form after setup", async () => {
    const csrf = await fetchSetupCsrf();
    const body = new URLSearchParams({
      _csrf: csrf,
      organizationName: "Acme",
      name: "Admin",
      email: "admin@example.com",
      password: strongPassword,
      passwordConfirm: strongPassword,
    });
    await dispatchWeb(
      new Request("http://localhost/setup", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrf)}`,
        },
        body: body.toString(),
      }),
    );

    const loginRes = await dispatchWeb(new Request("http://localhost/login"));
    expect(loginRes.status).toBe(200);
    const html = await loginRes.text();
    expect(html).toContain("Sign in");
  });
});

afterAll(async () => {
  await closeDatabase();
});
