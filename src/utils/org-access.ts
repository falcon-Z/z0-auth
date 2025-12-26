/**
 * Organization Access Control Middleware
 * Provides middleware for checking org membership and scope permissions
 */

import { Context, Next } from "hono";
import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder, RequestContext } from "@z0/utils/error-handling";
import type { TokenPayload } from "@z0/utils/auth";

/**
 * Middleware to require org membership
 * Checks if the authenticated user is a member of the organization specified in the route params
 */
export function requireOrgMembership() {
  return async (c: Context, next: Next) => {
    const tokenPayload = c.get("tokenPayload") as TokenPayload | undefined;
    const orgId = c.req.param("orgId");

    if (!tokenPayload?.userId) {
      return c.json(
        ErrorResponseBuilder.unauthorized(
          "Authentication required",
          new RequestContext(c)
        ),
        401
      );
    }

    if (!orgId) {
      return c.json(
        ErrorResponseBuilder.badRequest(
          "Organization ID is required",
          new RequestContext(c)
        ),
        400
      );
    }

    try {
      // Check if user is a member of the organization
      const membership = await db.organizationMember.findFirst({
        where: {
          organizationId: orgId,
          userId: tokenPayload.userId,
          isActive: true,
        },
        include: {
          role: true,
        },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.forbidden(
            "You are not a member of this organization",
            new RequestContext(c)
          ),
          403
        );
      }

      // Add membership info to context for downstream use
      c.set("orgMembership", membership);
      c.set("orgRole", membership.role);
      c.set("orgRoleType", membership.role?.builtInRole || membership.roleType);

      await next();
    } catch (error) {
      console.error("Error checking org membership:", error);
      return c.json(
        ErrorResponseBuilder.internalError(
          "Failed to verify organization membership",
          new RequestContext(c)
        ),
        500
      );
    }
  };
}

/**
 * Middleware to require a specific scope
 * Must be used after requireOrgMembership
 * @param scopeName The scope name to check (e.g., "org:settings:read")
 */
export function requireScope(scopeName: string) {
  return async (c: Context, next: Next) => {
    const tokenPayload = c.get("tokenPayload") as TokenPayload | undefined;
    const orgId = c.req.param("orgId");
    const orgRoleType = c.get("orgRoleType") as string | undefined;

    if (!tokenPayload?.userId || !orgId) {
      return c.json(
        ErrorResponseBuilder.unauthorized(
          "Authentication required",
          new RequestContext(c)
        ),
        401
      );
    }

    // Super admin and org owners have all permissions
    if (
      tokenPayload.platformRole === "SUPER_ADMIN" ||
      orgRoleType === "ORG_OWNER"
    ) {
      await next();
      return;
    }

    // ORG_ADMIN has most permissions except ownership transfer
    if (orgRoleType === "ORG_ADMIN") {
      // Block only ownership-level operations
      if (scopeName.includes("ownership") || scopeName.includes("delete:org")) {
        return c.json(
          ErrorResponseBuilder.forbidden(
            `Insufficient permissions: ${scopeName} requires owner role`,
            new RequestContext(c)
          ),
          403
        );
      }
      await next();
      return;
    }

    // Parse scope to check permissions
    const [resource, action, permission] = scopeName.split(":");

    // Check if user has the required scope through their role
    try {
      const membership = c.get("orgMembership") as any;

      if (membership?.role?.id) {
        const roleScope = await db.roleScope.findFirst({
          where: {
            roleId: membership.role.id,
            scope: {
              name: {
                contains: resource,
              },
              organizationId: orgId,
            },
          },
          include: {
            scope: true,
          },
        });

        if (roleScope) {
          // Check specific permission
          const hasPermission =
            (permission === "read" && roleScope.canRead) ||
            (permission === "write" && roleScope.canWrite) ||
            (permission === "delete" && roleScope.canDelete) ||
            (permission === "manage" && roleScope.canManage) ||
            (!permission && (roleScope.canRead || roleScope.canWrite));

          if (hasPermission) {
            await next();
            return;
          }
        }
      }

      // Check direct user scopes
      const userScope = await db.userScope.findFirst({
        where: {
          userId: tokenPayload.userId,
          scope: {
            name: {
              contains: resource,
            },
            organizationId: orgId,
          },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          scope: true,
        },
      });

      if (userScope) {
        const hasPermission =
          (permission === "read" && userScope.canRead) ||
          (permission === "write" && userScope.canWrite) ||
          (permission === "delete" && userScope.canDelete) ||
          (permission === "manage" && userScope.canManage) ||
          (!permission && (userScope.canRead || userScope.canWrite));

        if (hasPermission) {
          await next();
          return;
        }
      }

      return c.json(
        ErrorResponseBuilder.forbidden(
          `Insufficient permissions: ${scopeName}`,
          new RequestContext(c)
        ),
        403
      );
    } catch (error) {
      console.error("Error checking scope:", error);
      return c.json(
        ErrorResponseBuilder.internalError(
          "Failed to verify permissions",
          new RequestContext(c)
        ),
        500
      );
    }
  };
}

/**
 * Helper to check if user has a specific org role
 */
export function hasOrgRole(
  c: Context,
  ...roles: ("ORG_OWNER" | "ORG_ADMIN" | "ORG_DEVELOPER" | "ORG_MEMBER")[]
): boolean {
  const orgRoleType = c.get("orgRoleType") as string | undefined;
  return orgRoleType ? roles.includes(orgRoleType as any) : false;
}

/**
 * Helper to check if user is org owner or admin
 */
export function isOrgAdminOrOwner(c: Context): boolean {
  return hasOrgRole(c, "ORG_OWNER", "ORG_ADMIN");
}

/**
 * Helper to check if user is platform admin
 */
export function isPlatformAdmin(c: Context): boolean {
  const tokenPayload = c.get("tokenPayload") as TokenPayload | undefined;
  return tokenPayload?.platformRole === "SUPER_ADMIN";
}
