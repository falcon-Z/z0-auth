import { test, expect } from "@playwright/test";

test("unauthenticated console visit redirects to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
