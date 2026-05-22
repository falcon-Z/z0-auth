import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
import { closeDatabase } from "../../packages/server/src/api/lib/db";
import { resetRateLimitsForTests } from "../../packages/server/src/api/lib/rate-limit";
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
        name: "Admin",
        email: "admin@example.com",
        password: strongPassword,
        passwordConfirm: strongPassword,
        organizationName: "Acme",
      },
    }),
  );
}

run("password reset unavailable", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  test("POST /api/auth/reset-password returns 503 after setup", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: csrf,
        body: { email: "admin@example.com" },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    const codes = (body.errors ?? []).map((e: { code: string }) => e.code);
    expect(codes).toContain(ErrorCodes.PASSWORD_RESET_UNAVAILABLE);
  });
});

afterAll(async () => {
  await closeDatabase();
});
