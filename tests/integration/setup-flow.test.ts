import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import type { SetupResponse } from "@z0/contracts/setup";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = makeStrongPassword();

run("setup flow", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    resetRateLimitsForTests();
  });

  test("GET /api/setup/status returns incomplete", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/setup/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toBe(false);
  });

  test("POST /api/setup creates bootstrap member and organization", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Owner User",
          email: "admin@example.com",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "Acme IAM",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as SetupResponse;
    expect(body.user.email).toBe("admin@example.com");
    expect(body.organizationName).toBe("Acme IAM");
    expect(body.user.id).toBeTruthy();
  });

  test("POST /api/setup again returns 409", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Other",
          email: "other@example.com",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "Other",
        },
      }),
    );
    expect(res.status).toBe(409);
  });

  test("GET /api/setup/status returns completed with organization name", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/setup/status"));
    const body = await res.json();
    expect(body.completed).toBe(true);
    expect(body.organizationName).toBe("Acme IAM");
  });
});

afterAll(async () => {
  await closeDatabase();
});
