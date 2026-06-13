import { test, expect } from "@playwright/test";

import { requireE2ePassword } from "./test-credentials";

const strongPassword = requireE2ePassword();

test.describe("owner console journey", () => {
  test("registers app, credential, scope, and app user without placeholders", async ({ page }) => {
    const suffix = Date.now();
    const appName = `E2E App ${suffix}`;
    const scopeName = `read:e2e${suffix}`;
    const userEmail = `e2e-user-${suffix}@example.com`;

    await page.goto("/apps");
    await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();

    await page.getByRole("button", { name: "Register application" }).click();
    await page.getByLabel("Name").fill(appName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: appName })).toBeVisible();

    await page.getByRole("button", { name: "Add credential" }).click();
    await expect(page.getByRole("dialog")).toContainText("Client ID");
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name").fill(`${appName} Updated`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: `${appName} Updated` })).toBeVisible();

    await page.getByRole("link", { name: "Scopes" }).click();
    await page.getByRole("button", { name: "Add scope" }).click();
    await page.getByLabel(/^Name/i).fill(scopeName);
    await page.getByRole("button", { name: "Add scope", exact: true }).click();
    await expect(page.getByRole("cell", { name: scopeName })).toBeVisible();

    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("button", { name: "Add user" }).click();
    await page.getByLabel("Name", { exact: true }).fill("E2E User");
    await page.getByLabel("Email", { exact: true }).fill(userEmail);
    await page.getByLabel("Password", { exact: true }).fill(strongPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(strongPassword);
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await expect(page.getByRole("cell", { name: userEmail })).toBeVisible();

    await page.getByRole("row").filter({ hasText: userEmail }).click();
    await expect(page.getByRole("heading", { name: "E2E User" })).toBeVisible();
    await expect(page.getByText(userEmail)).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("link", { name: "Email & SMTP" }).click();
    await expect(page.getByRole("heading", { name: "Email & SMTP", level: 1 })).toBeVisible();
    await expect(page.getByText("not available yet", { exact: false })).not.toBeVisible();
  });
});
