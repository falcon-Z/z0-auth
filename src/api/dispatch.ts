import { authApiRoutes } from "./auth/routes";
import { deployApiRoutes } from "./deploy/routes";
import { healthApiRoutes } from "./health/routes";
import { applySetupGuard, dispatchRoute } from "./lib/router";
import { setupApiRoutes } from "./setup/routes";
import { v1PatternRoutes } from "./v1/pattern-routes";
import { v1ApiRoutes } from "./v1/routes";
import { problem } from "./lib/http";

export const apiRouteMap = applySetupGuard({
  ...healthApiRoutes,
  ...deployApiRoutes,
  ...setupApiRoutes,
  ...authApiRoutes,
  ...v1ApiRoutes,
});

export async function dispatchApiRequest(req: Request): Promise<Response> {
  const res = await dispatchRoute(apiRouteMap, req, v1PatternRoutes);
  return res ?? problem(404, "Not Found", "API route not found");
}
