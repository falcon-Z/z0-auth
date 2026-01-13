import { prisma } from "./prisma";

export type Permission = "read" | "write" | "delete" | "manage";

interface PermissionContext {
  orgId?: string;
  appId?: string;
}

/**
 * Check if a user has a specific permission on a scope
 * @param userId User ID
 * @param scopeName Scope name (e.g., "users", "apps", "settings")
 * @param permission Permission type
 * @param context Optional context for scope checking
 * @returns true if user has permission, false otherwise
 */
export async function checkPermission(
  userId: string,
  scopeName: string,
  permission: Permission,
  context?: PermissionContext
): Promise<boolean> {
  try {
    // If orgId is provided, check within that organization
    // Otherwise, check across all organizations the user belongs to
    const whereClause: any = {
      userId,
    };

    if (context?.orgId) {
      whereClause.role = {
        organizationId: context.orgId,
      };
    }

    // Get user's roles
    const userRoles = await prisma.userRole.findMany({
      where: whereClause,
      include: {
        role: {
          include: {
            inheritsFrom: true,
          },
        },
      },
    });

    if (userRoles.length === 0) {
      return false;
    }

    // Collect all role IDs (including inherited roles)
    const roleIds: string[] = [];
    for (const ur of userRoles) {
      roleIds.push(ur.roleId);
      if (ur.role.inheritsFromId) {
        roleIds.push(ur.role.inheritsFromId);
      }
    }

    // Find the scope
    const scopeWhereClause: any = {
      name: scopeName,
    };

    if (context?.orgId) {
      scopeWhereClause.organizationId = context.orgId;
    }

    const scope = await prisma.scope.findFirst({
      where: scopeWhereClause,
    });

    if (!scope) {
      // Scope doesn't exist - default deny
      return false;
    }

    // Check role scopes
    const roleScopes = await prisma.roleScope.findMany({
      where: {
        roleId: { in: roleIds },
        scopeId: scope.id,
      },
    });

    // Check if any role has the required permission
    const permissionField = getPermissionField(permission);
    const hasRolePermission = roleScopes.some(
      (rs) => rs[permissionField] === true
    );

    if (hasRolePermission) {
      return true;
    }

    // Check direct user scopes
    const userScopes = await prisma.userScope.findMany({
      where: {
        userId,
        scopeId: scope.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    const hasUserPermission = userScopes.some(
      (us) => us[permissionField] === true
    );

    return hasUserPermission;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if a user has any of the specified permissions on a scope
 * @param userId User ID
 * @param scopeName Scope name
 * @param permissions Array of permissions to check
 * @param context Optional context
 * @returns true if user has any of the permissions, false otherwise
 */
export async function checkAnyPermission(
  userId: string,
  scopeName: string,
  permissions: Permission[],
  context?: PermissionContext
): Promise<boolean> {
  for (const permission of permissions) {
    const hasPermission = await checkPermission(
      userId,
      scopeName,
      permission,
      context
    );
    if (hasPermission) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a user has all of the specified permissions on a scope
 * @param userId User ID
 * @param scopeName Scope name
 * @param permissions Array of permissions to check
 * @param context Optional context
 * @returns true if user has all of the permissions, false otherwise
 */
export async function checkAllPermissions(
  userId: string,
  scopeName: string,
  permissions: Permission[],
  context?: PermissionContext
): Promise<boolean> {
  for (const permission of permissions) {
    const hasPermission = await checkPermission(
      userId,
      scopeName,
      permission,
      context
    );
    if (!hasPermission) {
      return false;
    }
  }
  return true;
}

/**
 * Get all scopes and permissions for a user
 * @param userId User ID
 * @param context Optional context
 * @returns Map of scope names to permissions
 */
export async function getUserPermissions(
  userId: string,
  context?: PermissionContext
): Promise<Map<string, Set<Permission>>> {
  const permissionsMap = new Map<string, Set<Permission>>();

  try {
    // Get user's roles
    const whereClause: any = { userId };
    if (context?.orgId) {
      whereClause.role = {
        organizationId: context.orgId,
      };
    }

    const userRoles = await prisma.userRole.findMany({
      where: whereClause,
      include: {
        role: {
          include: {
            inheritsFrom: true,
          },
        },
      },
    });

    if (userRoles.length === 0) {
      return permissionsMap;
    }

    // Collect all role IDs
    const roleIds: string[] = [];
    for (const ur of userRoles) {
      roleIds.push(ur.roleId);
      if (ur.role.inheritsFromId) {
        roleIds.push(ur.role.inheritsFromId);
      }
    }

    // Get role scopes
    const roleScopes = await prisma.roleScope.findMany({
      where: {
        roleId: { in: roleIds },
      },
      include: {
        scope: true,
      },
    });

    // Process role scopes
    for (const rs of roleScopes) {
      if (!permissionsMap.has(rs.scope.name)) {
        permissionsMap.set(rs.scope.name, new Set<Permission>());
      }
      const perms = permissionsMap.get(rs.scope.name)!;
      if (rs.canRead) perms.add("read");
      if (rs.canWrite) perms.add("write");
      if (rs.canDelete) perms.add("delete");
      if (rs.canManage) perms.add("manage");
    }

    // Get direct user scopes
    const scopeWhereClause: any = {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    if (context?.orgId) {
      scopeWhereClause.scope = {
        organizationId: context.orgId,
      };
    }

    const userScopes = await prisma.userScope.findMany({
      where: scopeWhereClause,
      include: {
        scope: true,
      },
    });

    // Process user scopes
    for (const us of userScopes) {
      if (!permissionsMap.has(us.scope.name)) {
        permissionsMap.set(us.scope.name, new Set<Permission>());
      }
      const perms = permissionsMap.get(us.scope.name)!;
      if (us.canRead) perms.add("read");
      if (us.canWrite) perms.add("write");
      if (us.canDelete) perms.add("delete");
      if (us.canManage) perms.add("manage");
    }

    return permissionsMap;
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return permissionsMap;
  }
}

/**
 * Helper function to get the permission field name
 */
function getPermissionField(permission: Permission): string {
  switch (permission) {
    case "read":
      return "canRead";
    case "write":
      return "canWrite";
    case "delete":
      return "canDelete";
    case "manage":
      return "canManage";
    default:
      throw new Error(`Unknown permission type: ${permission}`);
  }
}
