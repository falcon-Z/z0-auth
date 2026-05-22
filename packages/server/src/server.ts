import { serve } from "bun";

import { authRoutes } from "./api/auth/routes";
import { checkDatabaseHealth } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { printStartupSummary } from "./api/lib/startup-log";
import { applySetupGuard, dispatchRoute } from "./api/lib/router";
import { healthRoutes } from "./api/health/routes";
import { setupRoutes } from "./api/setup/routes";
import { v1Routes } from "./api/v1/routes";
import { isSetupComplete } from "./api/lib/platform";
import { webRoutes } from "./web/routes";

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
      "Platform setup is incomplete. Complete setup at /setup or set ALLOW_INCOMPLETE_SETUP=true for maintenance.",
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
  routes: webRoutes,

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const apiResponse = await dispatchRoute(apiRoutes, req);
      if (apiResponse) return apiResponse;
      return new Response(
        JSON.stringify({ type: "about:blank", title: "Not Found", status: 404, detail: "Unknown API route" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return undefined;
  },

  development:
    config.nodeEnv !== "production"
      ? {
          hmr: false,
          console: true,
        }
      : false,
});

printStartupSummary(config, dbHealth);

void server;
