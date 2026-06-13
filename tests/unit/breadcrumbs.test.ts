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

  test("app scopes trail includes application parent", () => {
    expect(staticBreadcrumbsForPath("/scopes/app-123")).toEqual([
      { label: "Applications", to: "/apps" },
      { label: "Application", to: "/apps/app-123" },
      { label: "Scopes" },
    ]);
  });
});
