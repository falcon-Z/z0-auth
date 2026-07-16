import { expect, test } from "@playwright/test";

test("registers and signs in with a passkey", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto("/profile/security");
  const app = await page.evaluate(async () => {
    const csrf = decodeURIComponent(document.cookie.match(/(?:^|; )z0_csrf=([^;]+)/)?.[1] ?? "");
    const appResponse = await fetch("/api/v1/apps", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ name: "Passkey App", redirectUris: ["http://localhost:3000/callback"], clientType: "public" }),
    });
    if (!appResponse.ok) throw new Error(await appResponse.text());
    const created = await appResponse.json();
    const userResponse = await fetch(`/api/v1/apps/${created.app.id}/users`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({
        email: "app-passkey@example.com",
        name: "App Passkey User",
        password: "AppPasskey-Strong-2026",
        passwordConfirm: "AppPasskey-Strong-2026",
      }),
    });
    if (!userResponse.ok) throw new Error(await userResponse.text());
    return { clientId: created.credential.clientId } as { clientId: string };
  });

  await page.getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByText("Passkey added", { exact: false })).toBeVisible();

  await context.clearCookies();
  await page.goto("/auth/login?mode=password");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL ?? "admin@example.com");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await context.clearCookies();
  const appSecurity = `/auth/security?client_id=${encodeURIComponent(app.clientId)}`;
  await page.goto(`/auth/login?client_id=${encodeURIComponent(app.clientId)}&mode=password&return_to=${encodeURIComponent(appSecurity)}`);
  await page.getByLabel("Email").fill("app-passkey@example.com");
  await page.getByLabel("Password").fill("AppPasskey-Strong-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/auth/security\\?client_id=${app.clientId}`));
  await page.getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByText("Passkey added", { exact: false })).toBeVisible();

  await context.clearCookies();
  await page.goto(`/auth/login?client_id=${encodeURIComponent(app.clientId)}&mode=password&return_to=${encodeURIComponent(appSecurity)}`);
  await page.getByLabel("Email").fill("app-passkey@example.com");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(new RegExp(`/auth/security\\?client_id=${app.clientId}`));
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
});
