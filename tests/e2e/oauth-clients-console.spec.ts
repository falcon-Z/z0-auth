import { test, expect } from "@playwright/test";
test("one Application supports server and SPA clients with separate protocol settings", async ({
  page,
}) => {
  await page.goto("/apps");
  await page.locator("header").getByRole("button", { name: "Add app" }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Client Product ${Date.now()}`);
  await page.getByLabel("Client label").fill("Server web");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/.+\/setup/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Server web" }),
  ).toContainText("confidential / interactive");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await page.getByLabel("Client label").fill("Browser SPA");
  await page.getByLabel("Client security class").selectOption("public");
  await page
    .getByLabel("Redirect URIs", { exact: true })
    .fill("http://localhost:5173/callback");
  await page
    .getByLabel("Browser origins", { exact: true })
    .fill("http://localhost:5173");
  await page.getByLabel("Enable refresh tokens").check();
  await page
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No client secret is issued for public clients.",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const spa = page.getByRole("row").filter({ hasText: "Browser SPA" });
  await expect(spa).toContainText("public / interactive");
  await spa.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByLabel("Client security class")).toBeDisabled();
  await expect(page.getByLabel("Purpose", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Browser origins", { exact: true })).toHaveValue(
    "http://localhost:5173",
  );
  await page.getByLabel("Client assurance").selectOption("strong");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(spa).toContainText("strong");
  await expect(
    page.getByRole("row").filter({ hasText: "Server web" }),
  ).toContainText("baseline");
  await spa.getByRole("button", { name: "Disable", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  await expect(spa).toContainText("disabled");
  await page.reload();
  await expect(spa).toContainText("disabled");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await page.getByLabel("Client label").fill("Backend worker");
  await page.getByLabel("Purpose", { exact: true }).selectOption("workload");
  await expect(page.getByLabel("Client security class")).toBeDisabled();
  await expect(page.getByLabel("Redirect URIs", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Enable refresh tokens")).toHaveCount(0);
  await page.getByRole("button", { name: "Create client", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Client secret");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const worker = page.getByRole("row").filter({ hasText: "Backend worker" });
  await expect(worker).toContainText("confidential / workload");
  await worker.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByLabel("Purpose", { exact: true })).toBeDisabled();
  await page.getByLabel("Client label").fill("Renamed worker");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Renamed worker" })).toContainText("confidential / workload");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Minimum assurance").selectOption("strong");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Server web" })).toContainText("strong");
});
