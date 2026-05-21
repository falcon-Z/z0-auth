import { serve } from "bun";

import { authRoutes } from "./api/auth/routes";
import { checkDatabaseHealth } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { printStartupSummary } from "./api/lib/startup-log";
import { applySetupGuard, dispatchRoute } from "./api/lib/router";
import { healthRoutes } from "./api/health/routes";
import { setupRoutes } from "./api/setup/routes";
import { v1Routes } from "./api/v1/routes";
import { guardConsoleEntry } from "./api/lib/console-guard";
import { isSetupComplete } from "./api/lib/platform";

import consoleApp from "./app/console/index.html";
import forgotPasswordPage from "./app/auth/forgot-password/index.html";
import loginPage from "./app/auth/login/index.html";
import registerPage from "./app/auth/register/index.html";
import setupPage from "./app/setup/index.html";
import setupCompletePage from "./app/setup/complete/index.html";

const config = loadConfig();
const dbHealth = await checkDatabaseHealth();

if (!dbHealth.ok && config.nodeEnv === "production") {
  printStartupSummary(config, dbHealth);
  process.exit(1);
}

if (config.nodeEnv === "production" && dbHealth.ok) {
  const setupComplete = await isSetupComplete();
  if (!setupComplete && !config.allowIncompleteSetup) {
    console.error(
      "Platform setup is incomplete. Complete POST /api/setup or set ALLOW_INCOMPLETE_SETUP=true for maintenance.",
    );
    process.exit(1);
  }
}

const apiRoutes = applySetupGuard({
  ...healthRoutes,
  ...setupRoutes,
  ...authRoutes,
  ...v1Routes,
});

const server = serve({
  hostname: config.bindAddress,
  port: config.port,

  routes: {
    "/login": loginPage,
    "/register": registerPage,
    "/forgot-password": forgotPasswordPage,
    "/setup": setupPage,
    "/setup/complete": setupCompletePage,

    "/": {
      GET: guardConsoleEntry,
      HEAD: guardConsoleEntry,
    },
    "/console": consoleApp,
  },

  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      return undefined;
    }

    const apiResponse = await dispatchRoute(apiRoutes, req);
    if (apiResponse) return apiResponse;
    return new Response(
      JSON.stringify({ type: "about:blank", title: "Not Found", status: 404, detail: "Unknown API route" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  },

  development:
    config.nodeEnv !== "production"
      ? {
          hmr: true,
          console: true,
        }
      : false,
});

printStartupSummary(config, dbHealth);

void server;
