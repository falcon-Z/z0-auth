import { ErrorResponseBuilder } from "@z0/utils/error-handling";
import type { Context, Next } from "hono";
import type { TokenPayload } from "@z0/utils/auth";
import { hasScope } from "@z0/utils/scopes";

/**
 * Require platform-level access (any platform role)
 */
export const requirePlatformManager = async (c: Context, next: Next) => {
  const user = c.get("user") as TokenPayload;
  if (!user || !user.platformRole) {
    return c.json(
      ErrorResponseBuilder.authorization("Access denied. Platform access required."),
      403
    );
  }
  await next();
};

/**
 * Require specific platform scope
 */
export const requirePlatformScope = (scope: string) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as TokenPayload;
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization("Access denied. Platform access required."),
        403
      );
    }

    if (!hasScope(user.effectiveScopes, scope)) {
      return c.json(
        ErrorResponseBuilder.authorization(`Missing required scope: ${scope}`),
        403
      );
    }

    await next();
  };
};

/**
 * Require SUPER_ADMIN role specifically
 */
export const requireSuperAdmin = async (c: Context, next: Next) => {
  const user = c.get("user") as TokenPayload;
  if (!user || user.platformRole !== "SUPER_ADMIN") {
    return c.json(
      ErrorResponseBuilder.authorization("Access denied. Super Admin only."),
      403
    );
  }
  await next();
};
