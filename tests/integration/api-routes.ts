process.env.Z0_DISABLE_RATE_LIMIT = "1";

import { authApiRoutes } from "../../src/api/auth/routes";
import { healthApiRoutes } from "../../src/api/health/routes";
import { applySetupGuard } from "../../src/api/lib/router";
import { setupApiRoutes } from "../../src/api/setup/routes";
import { v1ApiRoutes } from "../../src/api/v1/routes";

export const integrationRoutes = applySetupGuard({
  ...healthApiRoutes,
  ...setupApiRoutes,
  ...authApiRoutes,
  ...v1ApiRoutes,
});

export async function dispatchApi(req: Request): Promise<Response> {
  const { dispatchRoute } = await import("../../src/api/lib/router");
  const res = await dispatchRoute(integrationRoutes, req);
  return res ?? new Response("Not found", { status: 404 });
}
