import { test as setup, expect } from "@playwright/test";
import { CSRF_COOKIE, CSRF_HEADER } from "../../src/lib/contracts/http";

const authFile = "tests/e2e/.auth/user.json";

setup("authenticate developer session", async ({ request }) => {
  const email = process.env.E2E_EMAIL ?? "admin@example.com";
  const password = process.env.E2E_PASSWORD;

  if (!password) {
    setup.skip(true, "Set E2E_PASSWORD to the admin password for this instance");
    return;
  }

  const statusRes = await request.get("/api/setup/status");
  expect(statusRes.ok()).toBeTruthy();
  const setCookie = statusRes.headers()["set-cookie"] ?? "";
  const csrfMatch = setCookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  expect(csrfMatch?.[1]).toBeTruthy();
  const csrfToken = decodeURIComponent(csrfMatch![1]!);

  const loginRes = await request.post("/api/auth/login", {
    headers: {
      [CSRF_HEADER]: csrfToken,
      cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
    },
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();

  await request.storageState({ path: authFile });
});
