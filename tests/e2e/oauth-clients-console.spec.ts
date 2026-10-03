import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// A real loopback document gives Chromium the correct network address space.
const originTest = test.extend<{ spaOrigin: string }>({
  spaOrigin: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>SPA origin fixture</title>");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  },
});
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

originTest("console origin registration controls actual SPA fetch and preflight", async ({ page, browser, baseURL, spaOrigin: origin }) => {
  await page.goto("/apps");
  await page.locator("header").getByRole("button", { name: "Add app" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Origin Product ${Date.now()}`);
  await page.getByLabel("Client label").fill("Origin SPA");
  await page.getByLabel("Client security class").selectOption("public");
  await page.getByLabel("Redirect URIs", { exact: true }).fill(`${origin}/callback`);
  const created = page.waitForResponse(response => response.url().endsWith("/api/v1/apps") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const registration = await (await created).json();
  expect(registration.client.browserOrigins).toEqual([]);
  const clientId = registration.client.clientId;
  const setupPath = `/apps/${registration.app.id}/setup`;
  await expect(page).toHaveURL(new RegExp(setupPath));
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Origin SPA" });
  // A separate browser context has no operator cookies or forced console Origin.
  const spaContext = await browser.newContext();
  const spa = await spaContext.newPage();
  const browserErrors: string[] = [];
  spa.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  await spa.goto(`${origin}/`);
  async function fetchToken(id = clientId) {
    return spa.evaluate(async ({ target, client }) => {
      try {
        const response = await fetch(`${target}/oauth/token?client_id=${encodeURIComponent(client)}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "browser-origin-test-key" },
          body: new URLSearchParams({ grant_type: "authorization_code", client_id: client, code: "invalid", redirect_uri: `${location.origin}/callback` }),
        });
        return { status: response.status, error: (await response.json()).error };
      } catch {
        return { status: 0, error: "browser_cors_denied" };
      }
    }, { target: baseURL!, client: id });
  }
  try {
    // Redirect registration alone cannot authorize this origin.
    expect((await fetchToken()).error).toBe("browser_cors_denied");
    await row.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByLabel("Browser origins", { exact: true }).fill(`${origin}/path`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Browser origin");
    await page.getByLabel("Browser origins", { exact: true }).fill(origin);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await row.getByRole("button", { name: "Manage", exact: true }).click();
    await expect(page.getByLabel("Browser origins", { exact: true })).toHaveValue(origin);
    browserErrors.length = 0;
    // A real OPTIONS request with Idempotency-Key now passes, and the error is readable.
    expect(await fetchToken(), browserErrors.join("\n")).toEqual({ status: 400, error: "invalid_grant" });
    await page.getByLabel("Browser origins", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await fetchToken()).error).toBe("browser_cors_denied");
    await page.reload();
    await row.getByRole("button", { name: "Manage", exact: true }).click();
    await expect(page.getByLabel("Browser origins", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Redirect URIs", { exact: true })).toHaveValue(`${origin}/callback`);
  } finally {
    await spaContext.close();
  }
});
