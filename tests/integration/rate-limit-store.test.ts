import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../src/api/lib/db";
import { checkRateLimit, clientIp, resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";

const run = hasTestDatabase() ? describe : describe.skip;

run("PostgreSQL rate limits", () => {
  const previousTrust = process.env.TRUST_PROXY_HOPS;

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
  });

  afterAll(async () => {
    if (previousTrust === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = previousTrust;
    await closeDatabase();
  });

  test("coordinates counters in the durable store", async () => {
    const config = { key: "unit:shared", limit: 2, windowMs: 60_000 };
    expect((await checkRateLimit(config)).allowed).toBe(true);
    expect((await checkRateLimit(config)).allowed).toBe(true);
    expect((await checkRateLimit(config)).allowed).toBe(false);
  });

  test("ignores forwarded addresses unless proxy trust is configured", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.10, 10.0.0.2" },
    });
    delete process.env.TRUST_PROXY_HOPS;
    expect(clientIp(request)).toBe("direct");
    process.env.TRUST_PROXY_HOPS = "2";
    expect(clientIp(request)).toBe("198.51.100.10");
  });
});
