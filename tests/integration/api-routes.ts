process.env.Z0_DISABLE_RATE_LIMIT = "1";

import { authRoutes } from "../../src/api/auth/routes";
import { healthRoutes } from "../../src/api/health/routes";
import { applySetupGuard } from "../../src/api/lib/router";
import { setupRoutes } from "../../src/api/setup/routes";
import { v1Routes } from "../../src/api/v1/routes";

export const integrationRoutes = applySetupGuard({
  ...healthRoutes,
  ...setupRoutes,
  ...authRoutes,
  ...v1Routes,
});

export async function dispatch(req: Request): Promise<Response> {
  const { dispatchRoute } = await import("../../src/api/lib/router");
  const res = await dispatchRoute(integrationRoutes, req);
  return res ?? new Response("Not found", { status: 404 });
}
