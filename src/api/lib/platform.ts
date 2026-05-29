import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

export type PlatformSettings = {
  organizationName: string;
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
  defaultTenantId: string | null;
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await getDb()`
    SELECT platform_name, setup_completed_at, default_tenant_id
    FROM platform_settings
    WHERE id = 1
  `;

  if (!row) {
    return { organizationName: "", setupCompleted: false, setupCompletedAt: null, defaultTenantId: null };
  }

  const r = row as {
    platform_name: string;
    setup_completed_at: Date | null;
    default_tenant_id: string | null;
  };

  const tenant = await getDefaultTenant();
  const organizationName = tenant?.name ?? r.platform_name;

  return {
    organizationName,
    setupCompleted: r.setup_completed_at != null,
    setupCompletedAt: r.setup_completed_at,
    defaultTenantId: r.default_tenant_id ? String(r.default_tenant_id) : null,
  };
}

export async function isSetupComplete(): Promise<boolean> {
  const settings = await getPlatformSettings();
  return settings.setupCompleted;
}
