import { MiddlewareHandler } from "hono";
import { checkPermission, Permission } from "../utils/permissions";

/**
 * Middleware factory to require a specific scope and permission
 * @param scopeName Scope name (e.g., "users", "apps", "settings")
 * @param permission Permission type (read, write, delete, manage)
 * @param options Optional configuration
 * @returns Middleware handler
 */
export function requireScope(
  scopeName: string,
  permission: Permission,
  options?: {
    orgIdParam?: string; // Parameter name for orgId (default: "orgId")
    appIdParam?: string; // Parameter name for appId (default: "appId")
  }
): MiddlewareHandler {
  return async (c, next) => {
    try {
      // Get user from context (set by authMiddleware)
      const user = c.get("user");

      if (!user || !user.id) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get context from route params
      const orgIdParam = options?.orgIdParam || "orgId";
      const appIdParam = options?.appIdParam || "appId";

      const orgId = c.req.param(orgIdParam);
      const appId = c.req.param(appIdParam);

      const context: any = {};
      if (orgId) context.orgId = orgId;
      if (appId) context.appId = appId;

      // Check permission
      const hasPermission = await checkPermission(
        user.id,
        scopeName,
        permission,
        context
      );

      if (!hasPermission) {
        return c.json(
          {
            error: "Forbidden",
            message: `You don't have '${permission}' permission on '${scopeName}' scope`,
          },
          403
        );
      }

      // Permission granted, continue
      await next();
    } catch (error) {
      console.error("Error in requireScope middleware:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}

/**
 * Middleware to require any of the specified permissions
 */
export function requireAnyScope(
  scopes: Array<{ scopeName: string; permission: Permission }>,
  options?: {
    orgIdParam?: string;
    appIdParam?: string;
  }
): MiddlewareHandler {
  return async (c, next) => {
    try {
      const user = c.get("user");

      if (!user || !user.id) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const orgIdParam = options?.orgIdParam || "orgId";
      const appIdParam = options?.appIdParam || "appId";

      const orgId = c.req.param(orgIdParam);
      const appId = c.req.param(appIdParam);

      const context: any = {};
      if (orgId) context.orgId = orgId;
      if (appId) context.appId = appId;

      // Check if user has any of the required permissions
      let hasAnyPermission = false;
      for (const { scopeName, permission } of scopes) {
        const hasPermission = await checkPermission(
          user.id,
          scopeName,
          permission,
          context
        );
        if (hasPermission) {
          hasAnyPermission = true;
          break;
        }
      }

      if (!hasAnyPermission) {
        return c.json(
          {
            error: "Forbidden",
            message: "You don't have the required permissions",
          },
          403
        );
      }

      await next();
    } catch (error) {
      console.error("Error in requireAnyScope middleware:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}

/**
 * Middleware to require all of the specified permissions
 */
export function requireAllScopes(
  scopes: Array<{ scopeName: string; permission: Permission }>,
  options?: {
    orgIdParam?: string;
    appIdParam?: string;
  }
): MiddlewareHandler {
  return async (c, next) => {
    try {
      const user = c.get("user");

      if (!user || !user.id) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const orgIdParam = options?.orgIdParam || "orgId";
      const appIdParam = options?.appIdParam || "appId";

      const orgId = c.req.param(orgIdParam);
      const appId = c.req.param(appIdParam);

      const context: any = {};
      if (orgId) context.orgId = orgId;
      if (appId) context.appId = appId;

      // Check if user has all of the required permissions
      for (const { scopeName, permission } of scopes) {
        const hasPermission = await checkPermission(
          user.id,
          scopeName,
          permission,
          context
        );
        if (!hasPermission) {
          return c.json(
            {
              error: "Forbidden",
              message: `You don't have '${permission}' permission on '${scopeName}' scope`,
            },
            403
          );
        }
      }

      await next();
    } catch (error) {
      console.error("Error in requireAllScopes middleware:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}
