import { serve } from "bun";

import { authRoutes } from "./api/auth/routes";
import { checkDatabaseHealth } from "./api/lib/db";
import { loadConfig } from "./api/lib/config";
import { printStartupSummary } from "./api/lib/startup-log";
import { healthRoutes } from "./api/health/routes";
import { v1Routes } from "./api/v1/routes";

import consoleApp from "./app/console/index.html";
import forgotPasswordPage from "./app/auth/forgot-password/index.html";
import loginPage from "./app/auth/login/index.html";
import registerPage from "./app/auth/register/index.html";

const config = loadConfig();
const dbHealth = await checkDatabaseHealth();

if (!dbHealth.ok && config.nodeEnv === "production") {
  printStartupSummary(config, dbHealth);
  process.exit(1);
}

const server = serve({
  hostname: config.bindAddress,
  port: config.port,

  routes: {
    ...healthRoutes,
    ...authRoutes,
    ...v1Routes,

    "/login": loginPage,
    "/register": registerPage,
    "/forgot-password": forgotPasswordPage,

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

// Keep reference so the server is not garbage-collected
void server;
