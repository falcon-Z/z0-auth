import type { MiddlewareHandler } from "hono";

/**
 * Hono middleware to enforce initial setup for platform managers.
 *
 * - If no super admin exists in the PlatformManager table, all routes except `/auth/setup/register`
 *   will redirect to `/auth/setup/register` to force super admin registration.
 * - If a super admin exists, any access to `/auth/setup/register` is always redirected to `/`.
 * - Otherwise, the request proceeds as normal.
 *
 * @param c - Hono context object
 * @param next - Hono next middleware function
 */

// This middleware checks Cloudflare KV for the initial setup status.
// Assumes a KV namespace is bound as `SETUP_KV` in your environment.
const initialSetupMiddleware: MiddlewareHandler = async (c, next) => {
  const kv = c.env?.SETUP_KV;
  let setupComplete = false;
  if (kv) {
    const value = await kv.get("initial_setup_complete");
    setupComplete = value === "true";
  }

  const path = c.req.path;

  if (!setupComplete) {
    if (path !== "/auth/setup/register") {
      return c.redirect("/auth/setup/register");
    }
    return await next();
  }

  if (path === "/auth/setup/register") {
    return c.redirect("/");
  }

  return await next();
};

export default initialSetupMiddleware;
