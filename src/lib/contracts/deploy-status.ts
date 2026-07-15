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
  /** True when the database, current schema, instance keys, and server settings are ready. */
  ready: boolean;
  nodeEnv: string;
  database: {
    configured: boolean;
    connected: boolean;
    /** True when migrations have been applied (instance_settings exists). */
    schemaReady: boolean;
    latencyMs?: number;
    code?: "database_missing" | "database_unavailable" | "schema_not_ready";
    error?: string;
  };
  instanceKeys: {
    ready: boolean;
    dataKey: InstanceKeySource;
    tokenKeys: InstanceKeySource;
    /** True when running in production but keys were auto-generated (should not happen). */
    unstableInProduction: boolean;
  };
  configuration: {
    ready: boolean;
    smtpMode?: "console" | "disabled" | "environment";
    publicOriginConfigured?: boolean;
    issues: Array<{
      code: "config_missing" | "config_invalid" | "config_incomplete" | "config_unsafe";
      variables: string[];
      message: string;
    }>;
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
