import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import type { SetupResponse } from "@shared/contracts/setup";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";

run("setup flow", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    resetRateLimitsForTests();
  });

  test("GET /api/setup/status returns incomplete", async () => {
    const res = await dispatch(buildRequest("GET", "/api/setup/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toBe(false);
  });

  test("POST /api/setup creates admin, default tenant, and memberships", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Super Admin",
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
    expect(body.tenant.name).toBe("Acme IAM");
    expect(body.tenant.slug).toBe("acme-iam");
    expect(body.user.id).toBeTruthy();
    expect(body.tenant.id).toBeTruthy();
  });

  test("POST /api/setup again returns 409", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
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
    const res = await dispatch(buildRequest("GET", "/api/setup/status"));
    const body = await res.json();
    expect(body.completed).toBe(true);
    expect(body.organizationName).toBe("Acme IAM");
  });
});

afterAll(async () => {
  await closeDatabase();
});
