import { test, expect } from "@playwright/test";

test.describe("members console", () => {
  test("loads the real Members page, not the placeholder", async ({ page }) => {
    await page.goto("/members");
    await expect(page).toHaveURL(/\/members/);
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByText("Not available yet")).not.toBeVisible();
    await expect(page.getByText("Integration checklist")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  });

  test("shows members tab and table headers", async ({ page }) => {
    await page.goto("/members");
    await expect(page.getByRole("tab", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  });
});
