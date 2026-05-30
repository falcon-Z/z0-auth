import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { makeStrongPassword } from "../helpers/password";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = makeStrongPassword();

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
  const res = await dispatchWeb(new Request("http://localhost/auth/setup"));
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

  test("GET /auth/setup returns HTML form", async () => {
    const res = await dispatchWeb(new Request("http://localhost/auth/setup"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Platform setup");
    expect(html).toContain('name="organizationName"');
    expect(html).toContain('data-validate');
    expect(html).toContain("/static/auth-forms.js");
    expect(html).toContain("data-msg-required");
  });

  test("GET /auth/setup sets z0_csrf cookie matching hidden _csrf field", async () => {
    const res = await dispatchWeb(new Request("http://localhost/auth/setup"));
    const html = await res.text();
    const fromHtml = extractCsrfFromHtml(html);
    const fromCookie = extractCsrfFromSetCookie(res);
    expect(fromHtml).toBeTruthy();
    expect(fromCookie).toBe(fromHtml);
    const cookies = res.headers.getSetCookie?.() ?? [];
    expect(cookies.some((c) => c.startsWith("200"))).toBe(false);
  });

  test("GET /static/auth-forms.js is served", async () => {
    const res = await dispatchWeb(new Request("http://localhost/static/auth-forms.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  test("POST /auth/setup redirects to login", async () => {
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
      new Request("http://localhost/auth/setup", {
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
    expect(res.headers.get("location")).toContain("/auth/login");
    expect(res.headers.get("location")).toContain("setup=complete");
  });

  test("GET /auth/login redirects to /auth/setup when incomplete", async () => {
    await resetTestDatabase();
    const res = await dispatchWeb(new Request("http://localhost/auth/login"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/auth/setup");
  });

  test("GET /auth/login shows form after setup", async () => {
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
      new Request("http://localhost/auth/setup", {
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

    const loginRes = await dispatchWeb(new Request("http://localhost/auth/login"));
    expect(loginRes.status).toBe(200);
    const html = await loginRes.text();
    expect(html).toContain("Sign in");
  });

  test("POST /auth/login with wrong password shows generic form error in HTML", async () => {
    const loginPage = await dispatchWeb(new Request("http://localhost/auth/login"));
    const loginHtml = await loginPage.text();
    const loginCsrf = extractCsrfFromHtml(loginHtml)!;
    const cookie = extractCsrfFromSetCookie(loginPage) ?? loginCsrf;

    const res = await dispatchWeb(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: loginCsrf,
          email: "admin@example.com",
          password: "WrongPassword123!Aa",
        }).toString(),
      }),
    );

    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("auth-form-error");
    expect(html).toContain("Invalid email or password");
  });

  test("POST /auth/login HTMX error returns swappable 200 with form error", async () => {
    await resetTestDatabase();
    const csrf = await fetchSetupCsrf();
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
          organizationName: "Acme",
          name: "Admin",
          email: "admin@example.com",
          password: strongPassword,
          passwordConfirm: strongPassword,
        }).toString(),
      }),
    );

    const loginPage = await dispatchWeb(new Request("http://localhost/auth/login"));
    const loginHtml = await loginPage.text();
    const loginCsrf = extractCsrfFromHtml(loginHtml)!;
    const cookie = extractCsrfFromSetCookie(loginPage) ?? loginCsrf;

    const res = await dispatchWeb(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          "hx-request": "true",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: loginCsrf,
          email: "admin@example.com",
          password: "WrongPassword123!Aa",
        }).toString(),
      }),
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("auth-form-error");
    expect(html).toContain("Invalid email or password");
  });
});

afterAll(async () => {
  await closeDatabase();
});
