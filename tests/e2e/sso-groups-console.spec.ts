import { expect, test } from "@playwright/test";
import { requireE2ePassword } from "./test-credentials";

test("SSO groups explain shared membership and prevent populated boundary changes", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const names = [`SSO A ${suffix}`, `SSO B ${suffix}`];
  const appUrls: string[] = [];
  for (const name of names) {
    await page.goto('/apps');
    await page.locator('header').getByRole('button', { name: 'Add app' }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/apps\/.+\/setup/);
    appUrls.push(page.url().replace(/\/setup$/, '/users'));
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await page.goto('/settings/app-groups');
  await page.getByRole('button', { name: 'Add group', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Each app still requires its own membership');
  await expect(dialog).toContainText('Populated domains cannot join, leave, or move');
  await page.getByLabel('Name', { exact: true }).fill(`Shared ${suffix}`);
  for (const name of names) await dialog.getByRole('checkbox', { name, exact: true }).check();
  await dialog.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: `Shared ${suffix}` });
  await expect(row).toContainText('On');
  await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();

  await page.goto(appUrls[0]!);
  await page.getByRole('button', { name: 'Add user', exact: true }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Shared Person');
  await page.getByLabel('Email', { exact: true }).fill(`sso-${suffix}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(requireE2ePassword());
  await page.getByLabel('Confirm password', { exact: true }).fill(requireE2ePassword());
  await page.getByRole('button', { name: 'Add user', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(appUrls[1]!);
  await expect(page.getByRole('row').filter({ hasText: `sso-${suffix}@example.com` })).toHaveCount(0);

  await page.goto('/settings/app-groups');
  await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const name of names) {
    await expect(dialog.getByRole('checkbox', { name, exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name, exact: true })).toBeDisabled();
  }
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Group updated.', { exact: true })).toBeVisible();
});
