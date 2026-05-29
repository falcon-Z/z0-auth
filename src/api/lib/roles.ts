import type { SQL } from "bun";

import { getDb } from "./db";

export async function getPlatformRoleKeys(userId: string): Promise<string[]> {
  const rows = await getDb()`
    SELECT r.key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
      AND ur.tenant_id IS NULL
      AND r.scope = 'platform'
    ORDER BY r.key
  `;
  return rows.map((row) => String((row as { key: string }).key));
}

export async function getTenantRoleKeys(userId: string, tenantId: string): Promise<string[]> {
  const rows = await getDb()`
    SELECT r.key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
      AND ur.tenant_id = ${tenantId}
      AND r.scope = 'tenant'
    ORDER BY r.key
  `;
  return rows.map((row) => String((row as { key: string }).key));
}

export async function assignPlatformRole(userId: string, roleKey: string, tx?: SQL): Promise<void> {
  const db = tx ?? getDb();
  const [role] = await db`
    SELECT id FROM roles WHERE key = ${roleKey} AND scope = 'platform'
  `;
  if (!role) return;
  await db`
    INSERT INTO user_roles (user_id, role_id, tenant_id)
    VALUES (${userId}, ${(role as { id: string }).id}, NULL)
    ON CONFLICT DO NOTHING
  `;
}

export async function assignTenantRole(
  userId: string,
  tenantId: string,
  roleKey: string,
  tx?: SQL,
): Promise<void> {
  const db = tx ?? getDb();
  const [role] = await db`
    SELECT id FROM roles WHERE key = ${roleKey} AND scope = 'tenant'
  `;
  if (!role) return;
  await db`
    INSERT INTO user_roles (user_id, role_id, tenant_id)
    VALUES (${userId}, ${(role as { id: string }).id}, ${tenantId})
    ON CONFLICT DO NOTHING
  `;
}
