/**
 * Scope-based Authorization Middleware
 *
 * These middleware functions check if the authenticated user has the required scopes.
 * Scopes are already computed and included in the JWT token (effectiveScopes),
 * so no database lookup is needed.
 */

import type { MiddlewareHandler } from "hono";
import { hasScope, hasAnyScope, hasAllScopes } from "@z0/utils/scopes";
import type { TokenPayload } from "@z0/utils/auth";

/**
 * Middleware to require a specific scope
 *
 * @param requiredScope - The scope string (e.g., "org:apps:read", "platform:users:manage")
 * @returns Middleware handler
 *
 * @example
 * // Require read access to organization apps
 * app.get('/orgs/:orgId/apps', requireScope('org:apps:read'), handler)
 *
 * // Require manage access to platform organizations
 * app.delete('/admin/orgs/:orgId', requireScope('platform:organizations:delete'), handler)
 */
export function requireScope(requiredScope: string): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    if (!user.effectiveScopes) {
      return c.json(
        {
          error: "Forbidden",
          message: "No scopes found in token",
        },
        403
      );
    }

    if (!hasScope(user.effectiveScopes, requiredScope)) {
      return c.json(
        {
          error: "Forbidden",
          message: `Missing required permission: ${requiredScope}`,
          requiredScope,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Middleware to require any one of the specified scopes (OR logic)
 *
 * @param requiredScopes - Array of scope strings
 * @returns Middleware handler
 *
 * @example
 * // Allow access if user has either read or manage permission
 * app.get('/resource', requireAnyScopeOf(['org:apps:read', 'org:apps:manage']), handler)
 */
export function requireAnyScopeOf(requiredScopes: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    if (!user.effectiveScopes) {
      return c.json(
        {
          error: "Forbidden",
          message: "No scopes found in token",
        },
        403
      );
    }

    if (!hasAnyScope(user.effectiveScopes, requiredScopes)) {
      return c.json(
        {
          error: "Forbidden",
          message: "Missing required permissions",
          requiredScopes,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Middleware to require all specified scopes (AND logic)
 *
 * @param requiredScopes - Array of scope strings
 * @returns Middleware handler
 *
 * @example
 * // Require both read and write permissions
 * app.post('/resource', requireAllScopesOf(['org:apps:read', 'org:apps:write']), handler)
 */
export function requireAllScopesOf(requiredScopes: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    if (!user.effectiveScopes) {
      return c.json(
        {
          error: "Forbidden",
          message: "No scopes found in token",
        },
        403
      );
    }

    if (!hasAllScopes(user.effectiveScopes, requiredScopes)) {
      return c.json(
        {
          error: "Forbidden",
          message: "Missing required permissions",
          requiredScopes,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Middleware to require platform-level access
 * User must have a platform role (SUPER_ADMIN, ORG_MANAGER, etc.)
 */
export function requirePlatformAccess(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    if (!user.platformRole) {
      return c.json(
        {
          error: "Forbidden",
          message: "Platform access required",
        },
        403
      );
    }

    await next();
  };
}

/**
 * Middleware to require super admin access
 */
export function requireSuperAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    if (user.platformRole !== "SUPER_ADMIN") {
      return c.json(
        {
          error: "Forbidden",
          message: "Super admin access required",
        },
        403
      );
    }

    await next();
  };
}

/**
 * Middleware to verify user has access to the organization in the route
 * Checks if user's current org context matches the route parameter
 * or if user has platform-level access
 *
 * @param options - Configuration options
 */
export function requireOrgAccess(options?: {
  paramName?: string; // Route parameter name for org ID (default: "orgId")
  allowPlatformAccess?: boolean; // Allow platform admins to access any org (default: true)
}): MiddlewareHandler {
  const paramName = options?.paramName || "orgId";
  const allowPlatformAccess = options?.allowPlatformAccess ?? true;

  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    const routeOrgId = c.req.param(paramName);

    if (!routeOrgId) {
      return c.json(
        {
          error: "Bad Request",
          message: `Missing ${paramName} parameter`,
        },
        400
      );
    }

    // Platform admins can access any org (if allowed)
    if (allowPlatformAccess && user.platformRole) {
      // Check if they have at least read access to organizations
      if (hasScope(user.effectiveScopes, "platform:organizations:read")) {
        await next();
        return;
      }
    }

    // Check if user's current org context matches
    if (user.orgContext?.orgId === routeOrgId) {
      await next();
      return;
    }

    return c.json(
      {
        error: "Forbidden",
        message: "Access to this organization denied",
      },
      403
    );
  };
}

/**
 * Middleware to verify user has access to the app in the route
 */
export function requireAppAccess(options?: {
  orgParamName?: string;
  appParamName?: string;
  allowOrgAccess?: boolean; // Allow org admins to access any app in their org
}): MiddlewareHandler {
  const orgParamName = options?.orgParamName || "orgId";
  const appParamName = options?.appParamName || "appId";
  const allowOrgAccess = options?.allowOrgAccess ?? true;

  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    const routeOrgId = c.req.param(orgParamName);
    const routeAppId = c.req.param(appParamName);

    if (!routeAppId) {
      return c.json(
        {
          error: "Bad Request",
          message: `Missing ${appParamName} parameter`,
        },
        400
      );
    }

    // Platform admins can access any app
    if (user.platformRole && hasScope(user.effectiveScopes, "platform:organizations:read")) {
      await next();
      return;
    }

    // Org-level access to any app in the org
    if (allowOrgAccess && routeOrgId && user.orgContext?.orgId === routeOrgId) {
      if (hasScope(user.effectiveScopes, "org:apps:read")) {
        await next();
        return;
      }
    }

    // App-level access
    if (user.appContext?.appId === routeAppId) {
      await next();
      return;
    }

    return c.json(
      {
        error: "Forbidden",
        message: "Access to this app denied",
      },
      403
    );
  };
}

/**
 * Middleware to ensure the request is for the authenticated user's own resource
 * Used for self-service endpoints like profile updates
 */
export function requireSelf(options?: {
  paramName?: string; // Route parameter name for user ID (default: "userId")
}): MiddlewareHandler {
  const paramName = options?.paramName || "userId";

  return async (c, next) => {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    const routeUserId = c.req.param(paramName);

    // Special case: "me" means current user
    if (routeUserId === "me" || routeUserId === user.userId) {
      await next();
      return;
    }

    return c.json(
      {
        error: "Forbidden",
        message: "You can only access your own resources",
      },
      403
    );
  };
}
