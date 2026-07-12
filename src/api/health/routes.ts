import { checkDatabaseHealth, checkDatabaseSchema } from "../lib/db";
import { areInstanceKeysReady } from "../lib/instance-keys";
import { requestPublicOrigin } from "../lib/config";
import { getSmtpEnvCredentials } from "../lib/smtp-env";
import { json } from "../lib/http";
import { loadConfig } from "../lib/config";

const startedAt = Date.now();

export const healthApiRoutes = {
  "/api/health": {
    async GET() {
      const db = await checkDatabaseHealth();
      const config = loadConfig();
      return json({
        status: db.ok ? "healthy" : "degraded",
        service: config.appName,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        checks: {
          database: { configured: db.configured, connected: db.ok },
        },
      });
    },
  },

  "/api/live": {
    GET() {
      return json({ status: "alive" });
    },
  },

  "/api/ready": {
    async GET() {
      const db = await checkDatabaseHealth();
      const schema = db.ok ? await checkDatabaseSchema() : { ready: false };
      let configuration = true;
      try {
        requestPublicOrigin(new Request("http://localhost"));
        getSmtpEnvCredentials();
      } catch {
        configuration = false;
      }
      const keys = areInstanceKeysReady();
      if (!db.ok || !schema.ready || !keys || !configuration) {
        return json(
          {
            status: "not_ready",
            checks: {
              database: { configured: db.configured, connected: db.ok, schemaReady: schema.ready },
              instanceKeys: keys,
              configuration,
            },
          },
          { status: 503 },
        );
      }
      return json({
        status: "ready",
        checks: {
          database: { configured: true, connected: true, schemaReady: true },
          instanceKeys: true,
          configuration: true,
        },
      });
    },
  },
} as const;
