import type { SQL } from "bun";

import { getDb } from "./db";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

export function slugifyOrganization(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "organization";
}

export async function uniqueTenantSlug(baseName: string, tx?: SQL): Promise<string> {
  const db = tx ?? getDb();
  let slug = slugifyOrganization(baseName);
  let attempt = 0;

  while (attempt < 10) {
    const [existing] = await db`SELECT id FROM tenants WHERE slug = ${slug}`;
    if (!existing) return slug;
    attempt += 1;
    slug = `${slugifyOrganization(baseName)}-${attempt}`;
  }

  return `${slugifyOrganization(baseName)}-${crypto.randomUUID().slice(0, 8)}`;
}

function mapTenantRow(row: {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
}): Tenant {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    isDefault: row.is_default,
  };
}

export async function getDefaultTenant(): Promise<Tenant | null> {
  const [row] = await getDb()`
    SELECT id, name, slug, is_default
    FROM tenants
    WHERE is_default = true
    LIMIT 1
  `;
  if (!row) return null;
  return mapTenantRow(row as { id: string; name: string; slug: string; is_default: boolean });
}

export async function getTenantForMember(userId: string, tenantId: string): Promise<Tenant | null> {
  const [row] = await getDb()`
    SELECT t.id, t.name, t.slug, t.is_default
    FROM tenants t
    JOIN tenant_memberships tm ON tm.tenant_id = t.id
    WHERE tm.user_id = ${userId} AND t.id = ${tenantId}
  `;
  if (!row) return null;
  return mapTenantRow(row as { id: string; name: string; slug: string; is_default: boolean });
}

export async function listUserTenants(userId: string): Promise<Tenant[]> {
  const rows = await getDb()`
    SELECT t.id, t.name, t.slug, t.is_default
    FROM tenants t
    JOIN tenant_memberships tm ON tm.tenant_id = t.id
    WHERE tm.user_id = ${userId}
    ORDER BY t.is_default DESC, t.name ASC
  `;
  return rows.map((row) =>
    mapTenantRow(row as { id: string; name: string; slug: string; is_default: boolean }),
  );
}

export async function getUserDefaultTenant(userId: string): Promise<Tenant | null> {
  const [row] = await getDb()`
    SELECT t.id, t.name, t.slug, t.is_default
    FROM tenant_memberships tm
    JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = ${userId}
    ORDER BY t.is_default DESC, t.created_at ASC
    LIMIT 1
  `;
  if (!row) return null;
  return mapTenantRow(row as { id: string; name: string; slug: string; is_default: boolean });
}

export async function resolveActiveTenant(userId: string): Promise<Tenant | null> {
  const [pref] = await getDb()`
    SELECT active_tenant_id
    FROM user_preferences
    WHERE user_id = ${userId}
  `;
  const preferredId = pref?.active_tenant_id
    ? String((pref as { active_tenant_id: string }).active_tenant_id)
    : null;
  if (preferredId) {
    const member = await getTenantForMember(userId, preferredId);
    if (member) return member;
  }
  return getUserDefaultTenant(userId);
}

export async function setActiveTenant(userId: string, tenantId: string): Promise<boolean> {
  const member = await getTenantForMember(userId, tenantId);
  if (!member) return false;

  await getDb()`
    INSERT INTO user_preferences (user_id, active_tenant_id, updated_at)
    VALUES (${userId}, ${tenantId}, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET active_tenant_id = ${tenantId}, updated_at = NOW()
  `;
  return true;
}
