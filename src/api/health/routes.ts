import { json } from "../lib/http";
import { loadConfig } from "../lib/config";
import { evaluateReadiness } from "../lib/readiness";

const startedAt = Date.now();

export const healthApiRoutes = {
  "/api/health": {
    async GET() {
      const readiness = await evaluateReadiness();
      const config = loadConfig();
      return json({
        status: readiness.ready ? "healthy" : "degraded",
        service: config.appName,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        checks: readiness.checks,
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
      const readiness = await evaluateReadiness();
      if (!readiness.ready) {
        return json(
          {
            status: "not_ready",
            checks: readiness.checks,
          },
          { status: 503 },
        );
      }
      return json({
        status: "ready",
        checks: readiness.checks,
      });
    },
  },
} as const;
