import { describe, expect, test } from "bun:test";

import { staticBreadcrumbsForPath } from "../../src/app/console/lib/breadcrumbs";

describe("staticBreadcrumbsForPath", () => {
  test("home has no trail segments", () => {
    expect(staticBreadcrumbsForPath("/")).toEqual([]);
  });

  test("settings and email nest under settings", () => {
    expect(staticBreadcrumbsForPath("/settings")).toEqual([{ label: "Settings" }]);
    expect(staticBreadcrumbsForPath("/communications/email")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Email & SMTP" },
    ]);
  });

  test("app scopes trail nests under application", () => {
    expect(staticBreadcrumbsForPath("/apps/app-123/scopes")).toEqual([
      { label: "Applications", to: "/apps" },
      { label: "Application", to: "/apps/app-123" },
      { label: "Scopes" },
    ]);
  });

  test("app users trail nests under application", () => {
    expect(staticBreadcrumbsForPath("/apps/app-123/users")).toEqual([
      { label: "Applications", to: "/apps" },
      { label: "Application", to: "/apps/app-123" },
      { label: "Users" },
    ]);
    expect(staticBreadcrumbsForPath("/apps/app-123/users/user-456")).toEqual([
      { label: "Applications", to: "/apps" },
      { label: "Application", to: "/apps/app-123" },
      { label: "Users", to: "/apps/app-123/users" },
      { label: "User" },
    ]);
  });
});
