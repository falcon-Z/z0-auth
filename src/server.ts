import { serve } from "bun";

import { apiRouteMap, dispatchApiRequest } from "./api/dispatch";
import { checkDatabaseHealth } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { loadRootEnv } from "./lib/load-root-env";

loadRootEnv();
import { initializeInstanceKeys } from "./api/lib/instance-keys";
import { printStartupSummary } from "./api/lib/startup-log";
await initializeInstanceKeys();
import { authWebRoutes } from "./web/auth/routes";
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

void server;
