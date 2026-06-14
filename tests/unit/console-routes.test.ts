import { describe, expect, test } from "bun:test";

import { consoleRoutes } from "../../src/app/console/routes";

describe("console routes", () => {
  test("defines the primary console destinations", () => {
    const paths = consoleRoutes.map((route) => route.path);
    expect(paths).toEqual([
      "/",
      "/apps/*",
      "/team/*",
      "/settings/*",
      "/activity",
      "/profile/*",
    ]);
  });
});
