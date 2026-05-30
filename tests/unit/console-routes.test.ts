import { describe, expect, test } from "bun:test";

import { CONSOLE_NAV_ITEMS } from "../../src/app/console/config/navigation";
import { WIRED_CONSOLE_NAV_PATHS, consoleRoutes, routePathForNav } from "../../src/app/console/routes";

describe("console routes", () => {
  test("every available nav item is wired to a real page", () => {
    const wired = new Set<string>(WIRED_CONSOLE_NAV_PATHS);
    for (const item of CONSOLE_NAV_ITEMS) {
      if (item.status !== "available") continue;
      expect(wired.has(item.path)).toBe(true);
    }
  });

  test("members uses a splat route for nested pages", () => {
    expect(routePathForNav("/members")).toBe("/members/*");
    const membersRoute = consoleRoutes.find((route) => route.path === "/members/*");
    expect(membersRoute).toBeDefined();
    expect(membersRoute?.element).toBeDefined();
  });

  test("planned modules still resolve to a route", () => {
    const sessions = CONSOLE_NAV_ITEMS.find((item) => item.id === "sessions");
    expect(sessions).toBeDefined();
    const route = consoleRoutes.find((r) => r.path === sessions!.path);
    expect(route?.element).toBeDefined();
  });
});
