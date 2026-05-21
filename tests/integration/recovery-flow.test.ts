import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { SetupResponse } from "@shared/contracts/setup";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";
const newPassword = "NewValidPassphrase88!";

run("recovery flow", () => {
  let recoveryKey = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Recovery Admin",
          email: "recovery@example.com",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "Recovery Test",
        },
      }),
    );
    const body = (await res.json()) as SetupResponse;
    recoveryKey = body.recoveryKey;
  });

  test("reset password with recovery key and login with new password", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const loginRes = await dispatch(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "recovery@example.com", password: strongPassword },
      }),
    );
    const oldToken = loginRes.headers.getSetCookie?.().find((c) => c.startsWith(`${SESSION_COOKIE}=`));

    const resetRes = await dispatch(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: csrf,
        body: {
          email: "recovery@example.com",
          recoveryKey,
          newPassword,
          passwordConfirm: newPassword,
        },
      }),
    );
    expect(resetRes.status).toBe(200);

    const sessionRes = await dispatch(
      buildRequest("GET", "/api/auth/session", {
        cookies: oldToken
          ? { [SESSION_COOKIE]: decodeURIComponent(oldToken.split("=")[1]?.split(";")[0] ?? "") }
          : undefined,
      }),
    );
    const session = await sessionRes.json();
    expect(session.authenticated).toBe(false);

    const loginNew = await dispatch(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "recovery@example.com", password: newPassword },
      }),
    );
    expect(loginNew.status).toBe(200);
  });
});

afterAll(async () => {
  await closeDatabase();
});
