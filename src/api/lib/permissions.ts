import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";

import { requireSession } from "./auth";
import { getDb } from "./db";
import { problem } from "./http";

/** Keys granted only via platform-scoped roles (never implied on every org). */
export function isPlatformPermissionKey(permissionKey: string): boolean {
  return permissionKey.startsWith("platform:") || permissionKey === "tenants:create";
}

export async function userHasPermission(
  userId: string,
  permissionKey: string,
  tenantId?: string,
): Promise<boolean> {
  if (tenantId !== undefined) {
    if (isPlatformPermissionKey(permissionKey)) {
      const [row] = await getDb()`
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ${userId}
          AND p.key = ${permissionKey}
          AND r.scope = 'platform'
          AND ur.tenant_id IS NULL
        LIMIT 1
      `;
      return Boolean(row);
    }

    const [row] = await getDb()`
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}
        AND p.key = ${permissionKey}
        AND r.scope = 'tenant'
        AND ur.tenant_id = ${tenantId}
      LIMIT 1
    `;
    return Boolean(row);
  }

  if (!isPlatformPermissionKey(permissionKey)) {
    return false;
  }

  const [row] = await getDb()`
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}
      AND p.key = ${permissionKey}
      AND r.scope = 'platform'
      AND ur.tenant_id IS NULL
    LIMIT 1
  `;
  return Boolean(row);
}

export async function requirePermission(
  req: BunRequest,
  permissionKey: string,
  tenantId: string,
): Promise<
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; response: Response }
> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth;

  const allowed = await userHasPermission(auth.userId, permissionKey, tenantId);
  if (!allowed) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You do not have permission to perform this action", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "You do not have permission to perform this action",
          },
        ],
      }),
    };
  }

  return auth;
}

export async function requirePlatformPermission(
  req: BunRequest,
  permissionKey: string,
): Promise<
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; response: Response }
> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth;

  const allowed = await userHasPermission(auth.userId, permissionKey);
  if (!allowed) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You do not have permission to perform this action", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "You do not have permission to perform this action",
          },
        ],
      }),
    };
  }

  return auth;
}

export async function listPlatformPermissionKeys(userId: string): Promise<string[]> {
  const rows = await getDb()`
    SELECT DISTINCT p.key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}
      AND r.scope = 'platform'
      AND ur.tenant_id IS NULL
    ORDER BY p.key
  `;
  return rows
    .map((row) => String((row as { key: string }).key))
    .filter((key) => isPlatformPermissionKey(key));
}

async function listTenantPermissionKeysForOrg(userId: string, tenantId: string): Promise<string[]> {
  const rows = await getDb()`
    SELECT DISTINCT p.key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}
      AND r.scope = 'tenant'
      AND ur.tenant_id = ${tenantId}
    ORDER BY p.key
  `;
  return rows.map((row) => String((row as { key: string }).key));
}

export async function listUserPermissionKeys(userId: string, tenantId: string): Promise<string[]> {
  const platformKeys = await listPlatformPermissionKeys(userId);
  const tenantKeys = await listTenantPermissionKeysForOrg(userId, tenantId);
  return [...new Set([...platformKeys, ...tenantKeys])].sort();
}

export async function sessionIncludesPermission(
  userId: string,
  permissionKey: string,
  tenantId?: string,
): Promise<boolean> {
  if (!tenantId) {
    return userHasPermission(userId, permissionKey);
  }
  return userHasPermission(userId, permissionKey, tenantId);
}
