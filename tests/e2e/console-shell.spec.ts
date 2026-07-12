import { test, expect } from "@playwright/test";

test.describe("console shell", () => {
  test("renders org nav, search, and account menu", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");

    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "E2E Organization", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose where to go" })).toBeVisible();
    await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();
  });

  test("mobile header keeps search icon, profile, and collapsed breadcrumbs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      "/apps/bab84903-75ed-4b0d-b9df-6b2ba1a1f1d0/users/7aa090b6-e522-457b-b78e-d9b5aa630e21",
    );

    await expect(page.getByRole("link", { name: "E2E Organization", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show path" })).toBeVisible();
  });

  test("org nav popover lists primary destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "E2E Organization", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Choose where to go" }).click();
    await expect(page.getByRole("menuitem", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Apps", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Team", exact: true })).toBeVisible();

    await page.getByRole("menuitem", { name: "Team", exact: true }).click();
    await expect(page).toHaveURL("/team");
  });

  test("settings page is reachable from account menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });

  test("profile page is reachable from account menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /Platform Owner/i }).click();
    await expect(page).toHaveURL("/profile");
  });

  test("loads sessions page when signed in", async ({ page }) => {
    await page.goto("/profile/sessions");
    const accountSections = page.getByRole("navigation", { name: "Account sections" });
    await expect(accountSections).toBeVisible();
    await expect(accountSections.getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();
  });
});
