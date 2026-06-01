import { describe, expect, test } from "bun:test";

import { isDatabaseConnectionError } from "../../src/api/lib/db";

describe("isDatabaseConnectionError", () => {
  test("detects Bun postgres connection closed", () => {
    const error = Object.assign(new Error("Connection closed"), {
      code: "ERR_POSTGRES_CONNECTION_CLOSED",
    });
    expect(isDatabaseConnectionError(error)).toBe(true);
  });

  test("detects connection refused message", () => {
    expect(isDatabaseConnectionError(new Error("connect ECONNREFUSED"))).toBe(true);
  });

  test("ignores unrelated errors", () => {
    expect(isDatabaseConnectionError(new Error("unique violation"))).toBe(false);
  });
});
