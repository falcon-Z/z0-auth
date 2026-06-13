import { getDb } from "./db";

export type InstanceSettings = {
  organizationName: string;
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
};

export async function getInstanceSettings(): Promise<InstanceSettings> {
  const [row] = await getDb()`
    SELECT organization_name, setup_completed_at
    FROM instance_settings
    WHERE id = 1
  `;

  if (!row) {
    return { organizationName: "", setupCompleted: false, setupCompletedAt: null };
  }

  const r = row as {
    organization_name: string;
    setup_completed_at: Date | null;
  };

  return {
    organizationName: r.organization_name ?? "",
    setupCompleted: r.setup_completed_at != null,
    setupCompletedAt: r.setup_completed_at,
  };
}

export async function isSetupComplete(): Promise<boolean> {
  const settings = await getInstanceSettings();
  return settings.setupCompleted;
}
