process.env.Z0_DISABLE_RATE_LIMIT = "1";

import { authRoutes } from "../../packages/server/src/api/auth/routes";
import { healthRoutes } from "../../packages/server/src/api/health/routes";
import { applySetupGuard } from "../../packages/server/src/api/lib/router";
import { setupRoutes } from "../../packages/server/src/api/setup/routes";
import { v1Routes } from "../../packages/server/src/api/v1/routes";

export const integrationRoutes = applySetupGuard({
  ...healthRoutes,
  ...setupRoutes,
  ...authRoutes,
  ...v1Routes,
});

export async function dispatchApi(req: Request): Promise<Response> {
  const { dispatchRoute } = await import("../../packages/server/src/api/lib/router");
  const res = await dispatchRoute(integrationRoutes, req);
  return res ?? new Response("Not found", { status: 404 });
}

/** @deprecated Use dispatchApi */
export const dispatch = dispatchApi;
