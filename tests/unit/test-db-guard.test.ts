import { afterEach, describe, expect, test } from "bun:test";

describe("getTestDatabaseUrl safety", () => {
  const savedTestUrl = process.env.TEST_DATABASE_URL;
  const savedDevUrl = process.env.DATABASE_URL;
  const savedZ0DevUrl = process.env.Z0_DEV_DATABASE_URL;

  afterEach(() => {
    if (savedTestUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = savedTestUrl;
    if (savedDevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDevUrl;
    if (savedZ0DevUrl === undefined) delete process.env.Z0_DEV_DATABASE_URL;
    else process.env.Z0_DEV_DATABASE_URL = savedZ0DevUrl;
  });

  test("resetTestDatabase rejects when test and dev URLs match", async () => {
    const url = "postgresql://postgres:password@localhost:5432/z0auth";
    process.env.TEST_DATABASE_URL = url;
    process.env.DATABASE_URL = url;
    process.env.Z0_DEV_DATABASE_URL = url;

    const { resetTestDatabase } = await import("../helpers/db");
    await expect(resetTestDatabase()).rejects.toThrow(/must not match the dev DATABASE_URL/);
  });
});
