import { test as setup, expect } from "@playwright/test";
import { CSRF_COOKIE, CSRF_HEADER } from "../../src/lib/contracts/http";

const authFile = "tests/e2e/.auth/user.json";

async function fetchCsrf(request: Parameters<Parameters<typeof setup>[1]>[0]["request"]): Promise<string> {
  const statusRes = await request.get("/api/setup/status");
  expect(statusRes.ok()).toBeTruthy();
  const setCookie = statusRes.headers()["set-cookie"] ?? "";
  const csrfMatch = setCookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  expect(csrfMatch?.[1]).toBeTruthy();
  return decodeURIComponent(csrfMatch![1]!);
}

setup("authenticate developer session", async ({ request }) => {
  const email = process.env.E2E_EMAIL ?? "admin@example.com";
  const password = process.env.E2E_PASSWORD;

  if (!password) {
    setup.skip(true, "Set E2E_PASSWORD to the admin password for this instance");
    return;
  }

  let csrfToken = await fetchCsrf(request);
  const statusRes = await request.get("/api/setup/status");
  const status = (await statusRes.json()) as { completed?: boolean };

  if (!status.completed) {
    const setupRes = await request.post("/api/setup", {
      headers: {
        [CSRF_HEADER]: csrfToken,
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
      },
      data: {
        name: "Platform Owner",
        email,
        password,
        passwordConfirm: password,
        organizationName: "E2E Organization",
      },
    });
    expect(setupRes.ok()).toBeTruthy();
  }

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
