import { test, expect } from "@playwright/test";

test.describe("team console", () => {
  test("loads real team page without placeholders", async ({ page }) => {
    await page.goto("/team");
    await expect(page).toHaveURL(/\/team/);

    await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();
    await expect(page.getByText("Integration checklist", { exact: false })).not.toBeVisible();

    await expect(page.getByRole("tab", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  });
});
