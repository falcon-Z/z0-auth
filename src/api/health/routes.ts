import { checkDatabaseHealth } from "../lib/db";
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
          database: db,
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
      if (!db.ok) {
        return json(
          {
            status: "not_ready",
            checks: { database: db },
          },
          { status: 503 },
        );
      }
      return json({
        status: "ready",
        checks: { database: db },
      });
    },
  },
} as const;
