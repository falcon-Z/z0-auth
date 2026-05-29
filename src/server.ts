import { serve } from "bun";

import { authApiRoutes } from "./api/auth/routes";
import { checkDatabaseHealth } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { loadRootEnv } from "./lib/load-root-env";

loadRootEnv();
import { printStartupSummary } from "./api/lib/startup-log";
import { applySetupGuard } from "./api/lib/router";
import { healthApiRoutes } from "./api/health/routes";
import { setupApiRoutes } from "./api/setup/routes";
import { v1ApiRoutes } from "./api/v1/routes";
import { isSetupComplete } from "./api/lib/platform";
import { authWebRoutes } from "./web/auth/routes";
import { oauthWebRoutes } from "./web/oauth/routes";
import consoleApp from "./app/console/index.html";

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
      "Platform setup is incomplete. Complete setup at /auth/setup or set ALLOW_INCOMPLETE_SETUP=true for maintenance.",
    );
    process.exit(1);
  }
}

const apiRoutes = applySetupGuard({
  ...healthApiRoutes,
  ...setupApiRoutes,
  ...authApiRoutes,
  ...v1ApiRoutes,
});

const server = serve({
  hostname: config.bindAddress,
  port: config.port,
  routes: {
    ...authWebRoutes,
    ...oauthWebRoutes,
    ...apiRoutes,
    "/": consoleApp,
    "/*": consoleApp,
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
