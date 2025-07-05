import { db } from "../lib/database/client";
import type { Context, MiddlewareHandler, Next } from "hono";

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
const initialSetupMiddleware: MiddlewareHandler = async (c, next) => {
  const superAdmin = await db.platformManager.findFirst({
    where: { roleType: "SUPER_ADMIN" },
  });

  const path = c.req.path;

  if (!superAdmin) {
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
