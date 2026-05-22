import { describe, expect, test } from "bun:test";

import { formatDatabaseTarget } from "../../packages/server/src/api/lib/startup-log";

describe("formatDatabaseTarget", () => {
  test("redacts credentials and shows host/port/database", () => {
    const target = formatDatabaseTarget("postgresql://postgres:secret@localhost:5432/z0auth");
    expect(target).toBe("localhost:5432/z0auth");
  });
});
