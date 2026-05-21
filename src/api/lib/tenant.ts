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

export async function getDefaultTenant(): Promise<Tenant | null> {
  const [row] = await getDb()`
    SELECT id, name, slug, is_default
    FROM tenants
    WHERE is_default = true
    LIMIT 1
  `;
  if (!row) return null;
  const r = row as { id: string; name: string; slug: string; is_default: boolean };
  return { id: String(r.id), name: r.name, slug: r.slug, isDefault: r.is_default };
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
  const r = row as { id: string; name: string; slug: string; is_default: boolean };
  return { id: String(r.id), name: r.name, slug: r.slug, isDefault: r.is_default };
}
