/** GET /api/deploy/status — infrastructure readiness (no auth). */

export type DeployProviderId =
  | "docker"
  | "google-cloud-run"
  | "railway"
  | "render"
  | "aws-ec2"
  | "generic";

export type InstanceKeySource = "env" | "file" | "generated" | "missing";

export type BootstrapOwnerField =
  | "organizationName"
  | "adminName"
  | "adminEmail"
  | "adminPassword";

export type DeployStatusResponse = {
  /** True when database is connected and instance keys are ready. */
  ready: boolean;
  nodeEnv: string;
  database: {
    configured: boolean;
    connected: boolean;
    /** True when migrations have been applied (instance_settings exists). */
    schemaReady: boolean;
    latencyMs?: number;
    error?: string;
  };
  instanceKeys: {
    ready: boolean;
    dataKey: InstanceKeySource;
    tokenKeys: InstanceKeySource;
    /** True when running in production but keys were auto-generated (should not happen). */
    unstableInProduction: boolean;
  };
  platform: {
    setupComplete: boolean;
    organizationName?: string;
    bootstrap: {
      configured: boolean;
      ready: boolean;
      missing: BootstrapOwnerField[];
    };
  } | null;
};
