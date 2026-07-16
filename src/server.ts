import { serve } from "bun";

import { apiRouteMap, dispatchApiRequest } from "./api/dispatch";
import { closeDatabase } from "./api/lib/db";
import { initializeInstanceKeys } from "./api/lib/instance-keys";
import { printStartupSummary } from "./api/lib/startup-log";
import { evaluateReadiness } from "./api/lib/readiness";
import { validateRuntimeConfiguration } from "./api/lib/runtime-config";
import { runConfiguredBootstrap } from "./api/setup/bootstrap";
import { applySecurityHeaders, secureRouteMap } from "./api/lib/security-headers";
import { loadConsoleHandler } from "./api/lib/console-assets";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

let runtimeConfiguration: ReturnType<typeof validateRuntimeConfiguration>;
try {
  runtimeConfiguration = validateRuntimeConfiguration();
  await initializeInstanceKeys();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`Startup failed: ${message}`);
  process.exit(1);
}

let configuredBootstrap: Awaited<ReturnType<typeof runConfiguredBootstrap>>;
try {
  configuredBootstrap = await runConfiguredBootstrap();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown first-owner setup error.";
  console.error(`Startup failed: ${message}`);
  process.exit(1);
}
if (configuredBootstrap.status === "created") {
  console.info(
    JSON.stringify({
      event: "setup.bootstrap_config_created",
    }),
  );
}
import { authWebRoutes } from "./web/auth/routes";
import { appInviteWebRoutes } from "./web/auth/app-invite-routes";
import { inviteWebRoutes } from "./web/auth/invite-routes";
import { passwordResetWebRoutes } from "./web/auth/password-reset-routes";
import { magicLinkWebRoutes } from "./web/auth/magic-link-routes";
import { federationWebRoutes } from "./web/auth/federation-routes";
import { appSessionsWebRoutes } from "./web/auth/app-sessions-routes";
import { emailVerificationWebRoutes } from "./web/auth/email-verification-routes";
import { mfaWebRoutes } from "./web/auth/mfa-routes";
import { appMfaWebRoutes } from "./web/auth/app-mfa-routes";
import { oauthWebRoutes } from "./web/oauth/routes";
const config = runtimeConfiguration.config;
const readiness = await evaluateReadiness();
const consoleHandler = await loadConsoleHandler(import.meta.dir);

const server = serve({
  hostname: config.bindAddress,
  port: config.port,
  routes: {
    ...secureRouteMap(authWebRoutes),
    ...secureRouteMap(inviteWebRoutes),
    ...secureRouteMap(appInviteWebRoutes),
    ...secureRouteMap(passwordResetWebRoutes),
    ...secureRouteMap(magicLinkWebRoutes),
    ...secureRouteMap(federationWebRoutes),
    ...secureRouteMap(appSessionsWebRoutes),
    ...secureRouteMap(emailVerificationWebRoutes),
    ...secureRouteMap(mfaWebRoutes),
    ...secureRouteMap(appMfaWebRoutes),
    ...secureRouteMap(oauthWebRoutes),
    ...secureRouteMap(apiRouteMap),
    "/api/*": async (request) => applySecurityHeaders(await dispatchApiRequest(request)),
    "/": consoleHandler,
    "/*": consoleHandler,
  },
  development:
    config.nodeEnv !== "production"
      ? {
          hmr: true,
          console: true,
        }
      : false,
});

printStartupSummary(config, readiness);

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
