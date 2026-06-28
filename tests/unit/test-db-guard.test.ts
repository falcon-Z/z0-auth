import { afterEach, describe, expect, test } from "bun:test";

describe("resetTestDatabase safety", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  test("rejects when database name is not a test database", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/z0auth";

    const { resetTestDatabase } = await import("../helpers/db");
    await expect(resetTestDatabase()).rejects.toThrow(/ends with "_test"/);
  });

  test("rejects outside NODE_ENV=test", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/z0auth_test";

    const { resetTestDatabase } = await import("../helpers/db");
    await expect(resetTestDatabase()).rejects.toThrow(/NODE_ENV=test/);
  });
});
