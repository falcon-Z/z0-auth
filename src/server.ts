import { serve } from "bun";
import app from "./index";
import index from "./index.html";
import { Logger } from "./utils/error-handling";
import { postStartupChecks } from "./utils/server";

/**
 * Resolve and validate the TCP port used by the HTTP server.
 */
export function resolvePort(portValue = process.env.PORT): number {
  if (portValue === undefined) {
    return 3000;
  }

  const parsedPort = Number(portValue);

  if (
    !Number.isInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65535
  ) {
    const message = `Invalid PORT environment variable: "${portValue}". Expected an integer between 1 and 65535.`;
    Logger.error(message, { portValue });
    throw new Error(message);
  }

  return parsedPort;
}

const port = resolvePort();
const hostname = process.env.BIND_HOST || "0.0.0.0";

export const server = serve({
  port,
  hostname,
  routes: {
    "/api/*": app.fetch,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

postStartupChecks();
