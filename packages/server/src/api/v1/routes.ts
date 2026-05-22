import { json } from "../lib/http";
import { meRoutes } from "./me";

/**
 * Versioned resource APIs (CRUD modules) live under /api/v1/*.
 * Add module routers here as features are implemented.
 */
export const v1Routes = {
  "/api/v1": {
    GET() {
      return json({
        version: "v1",
        modules: ["me"],
        message: "Resource APIs are mounted under /api/v1/<resource>.",
      });
    },
  },
  ...meRoutes,
} as const;
