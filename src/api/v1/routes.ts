import { json } from "../lib/http";

/**
 * Versioned resource APIs (CRUD modules) live under /api/v1/*.
 * Add module routers here as features are implemented.
 */
export const v1Routes = {
  "/api/v1": {
    GET() {
      return json({
        version: "v1",
        modules: [],
        message: "Resource APIs will be mounted under /api/v1/<resource>.",
      });
    },
  },
} as const;
