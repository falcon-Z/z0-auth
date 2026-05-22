import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../packages/server/src/api/lib/db";
import { resetRateLimitsForTests } from "../../packages/server/src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = "ValidPassphrase99!";

run("setup hijack", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
  });

  test("parallel setup requests allow only one success", async () => {
    const csrf = await fetchCsrfToken(dispatch);
    const body = {
      name: "Race Admin",
      email: "race@example.com",
      password: strongPassword,
      passwordConfirm: strongPassword,
      organizationName: "Race Co",
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatch(
          buildRequest("POST", "/api/setup", {
            csrfToken: csrf,
            body,
          }),
        ),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    expect(statuses.filter((s) => s !== 201).length).toBe(4);
  });
});

afterAll(async () => {
  await closeDatabase();
});
