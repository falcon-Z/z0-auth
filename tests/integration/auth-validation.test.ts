import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@shared/contracts/errors";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatch);
  await dispatch(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Auth Admin",
        email: "auth@example.com",
        password: strongPassword,
        passwordConfirm: strongPassword,
        organizationName: "Auth Test",
      },
    }),
  );
}

run("auth validation", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  test("login rejects invalid email format", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "bad", password: strongPassword },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.[0]?.code).toBe(ErrorCodes.INVALID_EMAIL);
  });

  test("login returns generic 401 for wrong password", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "auth@example.com", password: "WrongPassphrase99!" },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.errors?.[0]?.code).toBe(ErrorCodes.INVALID_CREDENTIALS);
  });
});

afterAll(async () => {
  await closeDatabase();
});
