import { serve } from "bun";

import { apiRouteMap, dispatchApiRequest } from "./api/dispatch";
import { checkDatabaseHealth, closeDatabase } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { loadRootEnv } from "./lib/load-root-env";

loadRootEnv();
import { initializeInstanceKeys } from "./api/lib/instance-keys";
import { printStartupSummary } from "./api/lib/startup-log";
await initializeInstanceKeys();
import { authWebRoutes } from "./web/auth/routes";
import { appInviteWebRoutes } from "./web/auth/app-invite-routes";
import { inviteWebRoutes } from "./web/auth/invite-routes";
import { passwordResetWebRoutes } from "./web/auth/password-reset-routes";
import { oauthWebRoutes } from "./web/oauth/routes";
import consoleApp from "./app/console/index.html";

const config = loadConfig();
const dbHealth = await checkDatabaseHealth();

const server = serve({
  hostname: config.bindAddress,
  port: config.port,
  routes: {
    ...authWebRoutes,
    ...inviteWebRoutes,
    ...appInviteWebRoutes,
    ...passwordResetWebRoutes,
    ...oauthWebRoutes,
    ...apiRouteMap,
    "/api/*": dispatchApiRequest,
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

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Shutdown timeout")), SHUTDOWN_TIMEOUT_MS);
  });

  try {
    await Promise.race([Promise.all([closeDatabase(), server.stop()]), timeout]);
  } catch (error) {
    console.error("Error during shutdown:", error);
  }
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

void server;
