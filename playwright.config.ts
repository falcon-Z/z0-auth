import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "console",
      testMatch: /(?:console-shell|members-console|owner-journey-console|mfa-enrollment-console)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
      },
    },
    {
      name: "public",
      testMatch: /public-.*\.spec\.ts/,
      use: devices["Desktop Chrome"],
    },
  ],
  webServer: {
    command: "bun src/server.ts",
    url: `${baseURL}/api/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: process.env,
  },
});
