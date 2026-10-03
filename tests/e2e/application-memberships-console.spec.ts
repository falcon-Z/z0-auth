import { test, expect } from "@playwright/test";
import { requireE2ePassword } from "./test-credentials";

test("membership removal and rejoin preserve the subject and account in the console", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const email = `member-${suffix}@example.com`;
  const password = requireE2ePassword();
  await page.goto("/apps");
  await page.locator("header").getByRole("button", { name: "Add app" }).click();
  await page.getByLabel("Name").fill(`Membership App ${suffix}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/.+\/setup/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: "Add user", exact: true }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Membership User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Add user", exact: true }).click();
  await page.getByRole("row").filter({ hasText: email }).click();
  await expect(page.getByRole("heading", { name: "Membership User", exact: true })).toBeVisible();
  const subjectUrl = page.url();
  const accountId = await page.getByText("Account ID", { exact: true }).locator("..").getByRole("definition").textContent();
  const accountState = page.getByText("Account state", { exact: true }).locator("..").getByRole("definition");
  const membershipState = page.locator("dt").filter({ hasText: /^Application membership$/ }).locator("..").getByRole("definition");
  await expect(accountState).toHaveText("active");
  await expect(membershipState).toHaveText("active");

  await page.getByRole("button", { name: "Remove membership", exact: true }).click();
  const removalDialog = page.getByRole("dialog");
  await expect(removalDialog).toContainText("Their account and stable subject will be preserved");
  await removalDialog.getByRole("button", { name: "Remove membership", exact: true }).click();
  await expect(membershipState).toHaveText("removed");
  await expect(accountState).toHaveText("active");
  await page.reload();
  await expect(membershipState).toHaveText("removed");
  await page.getByRole("button", { name: "Rejoin application", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enable", exact: true }).click();
  await expect(membershipState).toHaveText("active");
  await expect(accountState).toHaveText("active");
  await expect(page).toHaveURL(subjectUrl);

  // Provisioning an existing Account through the dialog reconnects its subject.
  await page.getByRole("button", { name: "Remove membership", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove membership", exact: true }).click();
  await expect(membershipState).toHaveText("removed");
  await page.goto(subjectUrl.replace(/\/users\/[^/]+$/, "/users"));
  await page.getByRole("button", { name: "Add user", exact: true }).first().click();
  await page.getByRole("button", { name: "Existing account", exact: true }).click();
  await page.getByLabel("Account ID", { exact: true }).fill(accountId!);
  await page.getByRole("button", { name: "Add membership", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: email }).click();
  await expect(page).toHaveURL(subjectUrl);
  await expect(membershipState).toHaveText("active");

  await page.getByRole("button", { name: "Suspend account", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("every application in its account domain");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend account", exact: true }).click();
  await expect(accountState).toHaveText("disabled");
  await expect(membershipState).toHaveText("active");
  await page.getByRole("button", { name: "Enable account", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enable account", exact: true }).click();
  await expect(accountState).toHaveText("active");
  await expect(page).toHaveURL(subjectUrl);
});
