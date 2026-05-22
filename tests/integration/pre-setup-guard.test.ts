import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../packages/server/src/api/lib/db";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { dispatch } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

run("pre-setup guard", () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  test("GET /api/setup/status returns incomplete", async () => {
    const res = await dispatch(buildRequest("GET", "/api/setup/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toBe(false);
  });

  test("protected auth APIs return 503 SetupRequired", async () => {
    for (const path of ["/api/auth/session", "/api/auth/login"]) {
      const res = await dispatch(buildRequest("GET", path));
      if (path.endsWith("/login")) {
        const postRes = await dispatch(
          buildRequest("POST", path, {
            body: { email: "a@b.co", password: "x" },
          }),
        );
        expect(postRes.status).toBe(503);
        const problem = await postRes.json();
        expect(problem.title).toBe("Setup Required");
        continue;
      }
      expect(res.status).toBe(503);
      const problem = await res.json();
      expect(problem.title).toBe("Setup Required");
    }
  });

  test("POST /api/auth/reset-password returns SetupRequired before setup", async () => {
    const res = await dispatch(buildRequest("POST", "/api/auth/reset-password", { body: {} }));
    expect(res.status).toBe(503);
    const problem = await res.json();
    expect(problem.title).toBe("Setup Required");
  });

  test("health endpoints remain available", async () => {
    const res = await dispatch(buildRequest("GET", "/api/health"));
    expect(res.status).toBe(200);
  });
});

afterAll(async () => {
  await closeDatabase();
});
