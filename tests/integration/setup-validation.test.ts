import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";

function fieldCodes(res: Response): Promise<string[]> {
  return res.json().then((body) => {
    const errors = (body as { errors?: { field: string; code: string }[] }).errors ?? [];
    return errors.map((e) => `${e.field}:${e.code}`);
  });
}

run("setup validation", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    resetRateLimitsForTests();
  });

  test("rejects empty required fields", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "  ",
          email: "",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "",
        },
      }),
    );
    expect(res.status).toBe(400);
    const codes = await fieldCodes(res);
    expect(codes).toContain(`name:${ErrorCodes.REQUIRED}`);
    expect(codes).toContain(`email:${ErrorCodes.REQUIRED}`);
    expect(codes).toContain(`organizationName:${ErrorCodes.REQUIRED}`);
  });

  test("rejects invalid email", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Admin",
          email: "not-email",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "Acme",
        },
      }),
    );
    expect(res.status).toBe(400);
    const codes = await fieldCodes(res);
    expect(codes).toContain(`email:${ErrorCodes.INVALID_EMAIL}`);
  });

  test("rejects weak password", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Admin",
          email: "admin@example.com",
          password: "short",
          passwordConfirm: "short",
          organizationName: "Acme",
        },
      }),
    );
    expect(res.status).toBe(400);
    const codes = await fieldCodes(res);
    expect(codes.some((c) => c.startsWith("password:") && c.endsWith(ErrorCodes.PASSWORD_POLICY))).toBe(true);
  });

  test("rejects password confirm mismatch", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Admin",
          email: "admin@example.com",
          password: strongPassword,
          passwordConfirm: "DifferentPassphrase99!",
          organizationName: "Acme",
        },
      }),
    );
    expect(res.status).toBe(400);
    const codes = await fieldCodes(res);
    expect(codes).toContain(`passwordConfirm:${ErrorCodes.PASSWORD_MISMATCH}`);
  });

  test("rejects missing CSRF token", async () => {
    const res = await dispatch(
      buildRequest("POST", "/api/setup", {
        body: {
          name: "Admin",
          email: "admin@example.com",
          password: strongPassword,
          passwordConfirm: strongPassword,
          organizationName: "Acme",
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});

afterAll(async () => {
  await closeDatabase();
});
