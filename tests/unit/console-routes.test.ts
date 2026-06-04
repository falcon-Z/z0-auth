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

  test("members, apps, scopes, and profile use splat routes for nested pages", () => {
    expect(routePathForNav("/members")).toBe("/members/*");
    expect(routePathForNav("/apps")).toBe("/apps/*");
    expect(routePathForNav("/scopes")).toBe("/scopes/*");
    expect(routePathForNav("/communications/email")).toBe("/communications/email/*");
    expect(routePathForNav("/profile")).toBe("/profile/*");
    const membersRoute = consoleRoutes.find((route) => route.path === "/members/*");
    const appsRoute = consoleRoutes.find((route) => route.path === "/apps/*");
    const scopesRoute = consoleRoutes.find((route) => route.path === "/scopes/*");
    const profileRoute = consoleRoutes.find((route) => route.path === "/profile/*");
    expect(membersRoute?.element).toBeDefined();
    expect(appsRoute?.element).toBeDefined();
    expect(scopesRoute?.element).toBeDefined();
    expect(profileRoute?.element).toBeDefined();
  });

  test("legacy security URLs redirect into profile", () => {
    const accountRedirect = consoleRoutes.find((route) => route.path === "/security/account");
    const sessionsRedirect = consoleRoutes.find((route) => route.path === "/security/sessions");
    expect(accountRedirect?.element).toBeDefined();
    expect(sessionsRedirect?.element).toBeDefined();
  });

  test("planned modules still resolve to a route", () => {
    const mfa = CONSOLE_NAV_ITEMS.find((item) => item.id === "mfa");
    expect(mfa).toBeDefined();
    const route = consoleRoutes.find((r) => r.path === mfa!.path);
    expect(route?.element).toBeDefined();
  });
});
