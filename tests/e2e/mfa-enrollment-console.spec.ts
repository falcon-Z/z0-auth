import { expect, test } from "@playwright/test";

test.describe("MFA enrollment", () => {
  test("renders a local scannable QR code", async ({ page }) => {
    await page.goto("/profile/security");
    await page.getByRole("button", { name: "Set up authenticator" }).click();

    const qr = page.getByRole("img", { name: "Authenticator setup QR code" });
    await expect(qr).toBeVisible();
    await expect.poll(() => qr.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(224);
    expect(await qr.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL("image/png").length)).toBeGreaterThan(1_000);
    await expect(page.getByText("Manual setup key", { exact: true })).toBeVisible();
  });
});
