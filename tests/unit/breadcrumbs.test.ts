import { describe, expect, test } from "bun:test";

import { staticBreadcrumbsForPath } from "../../src/app/console/lib/breadcrumbs";

describe("staticBreadcrumbsForPath", () => {
  test("home has no trail segments", () => {
    expect(staticBreadcrumbsForPath("/")).toEqual([]);
  });

  test("settings and email nest under settings", () => {
    expect(staticBreadcrumbsForPath("/settings")).toEqual([{ label: "Settings" }]);
    expect(staticBreadcrumbsForPath("/settings/email")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Email" },
    ]);
  });

  test("team and roles nest correctly", () => {
    expect(staticBreadcrumbsForPath("/team")).toEqual([{ label: "Team" }]);
    expect(staticBreadcrumbsForPath("/team/roles")).toEqual([
      { label: "Team", to: "/team" },
      { label: "Roles" },
    ]);
    expect(staticBreadcrumbsForPath("/team/roles/role-123")).toEqual([
      { label: "Team", to: "/team" },
      { label: "Roles", to: "/team/roles" },
      { label: "Role" },
    ]);
  });

  test("app permissions trail nests under app setup", () => {
    expect(staticBreadcrumbsForPath("/apps/app-123/permissions")).toEqual([
      { label: "Apps", to: "/apps" },
      { label: "App", to: "/apps/app-123/setup" },
      { label: "Permissions" },
    ]);
  });

  test("app users trail nests under app setup", () => {
    expect(staticBreadcrumbsForPath("/apps/app-123/users")).toEqual([
      { label: "Apps", to: "/apps" },
      { label: "App", to: "/apps/app-123/setup" },
      { label: "Users" },
    ]);
    expect(staticBreadcrumbsForPath("/apps/app-123/users/user-456")).toEqual([
      { label: "Apps", to: "/apps" },
      { label: "App", to: "/apps/app-123/setup" },
      { label: "Users", to: "/apps/app-123/users" },
      { label: "User" },
    ]);
  });
});
