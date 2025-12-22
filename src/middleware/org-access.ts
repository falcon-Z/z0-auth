import { MiddlewareHandler } from "hono";
import { prisma } from "../utils/prisma";

/**
 * Middleware to require access to a specific organization
 * Checks if the user is a platform admin, belongs to the org, or is an org admin
 * @param options Optional configuration
 * @returns Middleware handler
 */
export function requireOrgAccess(options?: {
  orgIdParam?: string; // Parameter name for orgId (default: "orgId")
  allowPlatformAdmin?: boolean; // Allow platform admins (default: true)
}): MiddlewareHandler {
  return async (c, next) => {
    try {
      // Get user from context (set by authMiddleware)
      const user = c.get("user");

      if (!user || !user.userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get orgId from route params
      const orgIdParam = options?.orgIdParam || "orgId";
      const orgId = c.req.param(orgIdParam);

      if (!orgId) {
        return c.json({ error: "Organization ID is required" }, 400);
      }

      // Check if user has access to this organization
      const allowPlatformAdmin = options?.allowPlatformAdmin !== false;

      const hasAccess =
        (allowPlatformAdmin && user.type === "platform_manager") ||
        user.orgId === orgId ||
        (await prisma.organizationUser.findFirst({
          where: {
            organizationId: orgId,
            userId: user.userId,
          },
        })) !== null;

      if (!hasAccess) {
        return c.json(
          {
            error: "Forbidden",
            message: "You don't have access to this organization",
          },
          403
        );
      }

      // Access granted, continue
      await next();
    } catch (error) {
      console.error("Error in requireOrgAccess middleware:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}
