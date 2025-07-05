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
export default async function initialSetupMiddleware(
  c: Context,
  next: Next
): Promise<MiddlewareHandler> {
  const superAdmin = await db.platformManager.findFirst({
    where: { roleType: "SUPER_ADMIN" },
  });

  const path = c.req.path;

  if (!superAdmin) {
    if (path !== "/auth/setup/register") {
      return c.redirect("/auth/setup/register");
    }
    return next();
  }

  if (path === "/auth/setup/register") {
    return c.redirect("/");
  }

  return next();
}
