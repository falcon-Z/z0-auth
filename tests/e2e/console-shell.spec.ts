import { test, expect } from "@playwright/test";

test.describe("console shell", () => {
  test("renders shadcn sidebar layout and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");

    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar.first()).toBeVisible();

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("link", { name: "OAuth clients" })).not.toBeVisible();

    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Platform" })).not.toBeVisible();
    await expect(page.getByText("Members", { exact: true })).toBeVisible();
  });

  test("loads compiled tailwind utilities for sidebar surfaces", async ({ page }) => {
    await page.goto("/");

    const bg = await page.locator('[data-slot="sidebar"]').first().evaluate((el) => {
      return getComputedStyle(el).backgroundColor;
    });

    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).not.toBe("transparent");
  });

  test("loads sessions page when signed in", async ({ page }) => {
    await page.goto("/profile/sessions");
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();
  });
});
