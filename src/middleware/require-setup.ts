/**
 * Setup Protection Middleware
 *
 * Ensures that the system cannot be used until super admin setup is complete.
 * This middleware blocks access to all routes except setup-related endpoints
 * when setup is required.
 *
 * How it works:
 * 1. Check if setup is complete (in-memory cached state)
 * 2. If setup required, allow only:
 *    - /api/setup/* endpoints
 *    - /api/health/* endpoints for container and load balancer checks
 *    - /setup page (frontend route)
 *    - Static assets
 * 3. For all other routes:
 *    - API routes: Return 503 Service Unavailable with redirect info
 *    - HTML routes: Issue 302 redirect to /setup
 */

import type { Context, Next } from "hono";
import { isSetupComplete } from "@z0/utils/setup-state";
import { Logger } from "@z0/utils/error-handling";

/**
 * Paths that are always allowed, even when setup is required
 */
const SETUP_ALLOWED_PATHS = [
  "/api/setup/status",
  "/api/setup/eligibility",
  "/api/setup/validate/email",
  "/api/setup/validate/organization",
  "/api/setup",
  "/api/setup/", // Allow trailing slash version
];

/**
 * Check if a path is allowed during setup
 */
function isPathAllowedDuringSetup(path: string): boolean {
  // Allow exact matches for setup endpoints
  if (SETUP_ALLOWED_PATHS.includes(path)) {
    return true;
  }

  // Allow health checks before setup for container platforms
  if (path.startsWith("/api/health/")) {
    return true;
  }

  // Allow setup page and its assets
  if (path === "/setup" || path.startsWith("/setup/")) {
    return true;
  }

  // Allow static assets (CSS, JS, images, fonts)
  if (
    path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)
  ) {
    return true;
  }

  return false;
}

/**
 * Middleware to protect routes when setup is required
 */
export async function requireSetupComplete(c: Context, next: Next) {
  const setupComplete = isSetupComplete();

  // If setup is complete, allow all requests
  if (setupComplete) {
    return next();
  }

  // Setup is required - check if this path is allowed
  const path = new URL(c.req.url).pathname;
  const isAllowed = isPathAllowedDuringSetup(path);

  if (isAllowed) {
    return next();
  }

  // Path is not allowed during setup - block it
  const isApiRoute = path.startsWith("/api/");

  if (isApiRoute) {
    // For API routes, return 503 with redirect information
    Logger.warn("API request blocked - setup required", {
      path,
      method: c.req.method,
      ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
    });

    return c.json(
      {
        error: "Service Unavailable",
        message: "System setup is required before this service can be used",
        code: "SETUP_REQUIRED",
        setupUrl: "/setup",
        statusUrl: "/api/setup/status",
      },
      503
    );
  } else {
    // For HTML routes, issue a redirect to setup page
    Logger.info("HTML request redirected to setup", {
      path,
      method: c.req.method,
    });

    return c.redirect("/setup", 302);
  }
}

/**
 * Optional: Middleware to block setup routes when setup is already complete
 * This prevents users from accessing setup page after configuration
 */
export async function blockSetupWhenComplete(c: Context, next: Next) {
  const setupComplete = isSetupComplete();

  if (!setupComplete) {
    // Setup not complete, allow access to setup routes
    return next();
  }

  // Setup is complete, block access to setup routes
  const path = new URL(c.req.url).pathname;

  Logger.warn("Setup route accessed after completion", {
    path,
    method: c.req.method,
  });

  const isApiRoute = path.startsWith("/api/");

  if (isApiRoute) {
    return c.json(
      {
        error: "Forbidden",
        message: "Setup has already been completed",
        code: "SETUP_ALREADY_COMPLETE",
      },
      403
    );
  } else {
    // Redirect to home/dashboard
    return c.redirect("/", 302);
  }
}
