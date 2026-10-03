import { test, expect } from "@playwright/test";

test("operator registers an API, selects its scopes, grants a client access and permanently retires it", async ({
  page,
}) => {
  await page.goto("/apps");
  await page.locator("header").getByRole("button", { name: "Add app" }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Resource Product ${Date.now()}`);
  await page.getByLabel("Client label").fill("Server web");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/.+\/setup/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const setup = page.url();
  await page.getByRole("link", { name: "Resources", exact: true }).click();
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByLabel("Resource name", { exact: true }).fill("Orders API");
  const audience = `https://api.example.com/orders/${Date.now()}`;
  await page.getByLabel("Audience URI", { exact: true }).fill(audience);
  await page.getByLabel("openid", { exact: true }).check();
  await page.getByLabel("email", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Orders API" });
  await expect(row).toContainText(audience);
  await row.getByRole("button", { name: "Edit resource", exact: true }).click();
  await expect(page.getByLabel("Audience URI", { exact: true })).toBeDisabled();
  await page
    .getByLabel("Resource name", { exact: true })
    .fill("Orders service");
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await page.goto(setup);
  await page
    .getByRole("row")
    .filter({ hasText: "Server web" })
    .getByRole("button", { name: "Resource access", exact: true })
    .click();
  await page
    .getByLabel("Resource", { exact: true })
    .selectOption({ label: `Orders service — ${audience}` });
  await page.getByLabel("openid", { exact: true }).check();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toContainText(
    "Orders service: openid",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Server web" })
    .getByRole("button", { name: "Resource access", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toContainText(
    "Orders service: openid",
  );
  await page
    .getByLabel("Resource", { exact: true })
    .selectOption({ label: `Orders service — ${audience}` });
  await page
    .getByRole("button", { name: "Remove access", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(0);
  await page.getByLabel("openid", { exact: true }).check();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Resources", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Orders service" })
    .getByRole("button", { name: "Retire", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Retire", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Orders service" }),
  ).toContainText("retired");
  const resourcesPage = page.url();
  await page.goto(setup);
  await page
    .getByRole("row")
    .filter({ hasText: "Server web" })
    .getByRole("button", { name: "Resource access", exact: true })
    .click();
  await page.getByLabel("Resource", { exact: true }).selectOption({
    label: `Orders service — ${audience} (unavailable)`,
  });
  await expect(
    page.getByRole("button", { name: "Save access", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove access", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.goto(resourcesPage);
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByLabel("Resource name", { exact: true }).fill("Reused API");
  await page.getByLabel("Audience URI", { exact: true }).fill(audience);
  await page
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("already reserved");
});
