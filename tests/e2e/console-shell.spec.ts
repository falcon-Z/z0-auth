import { test, expect } from "@playwright/test";

test.describe("console shell", () => {
  test("renders breadcrumb header without sidebar or top nav", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");

    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "breadcrumb" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

    await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Applications" })).toBeVisible();
  });

  test("settings page is reachable from header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  test("loads sessions page when signed in", async ({ page }) => {
    await page.goto("/profile/sessions");
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();
  });
});
