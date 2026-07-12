import { apiRouteMap } from "../../src/api/dispatch";
import { dispatchApiRequest } from "../../src/api/dispatch";

export const integrationRoutes = apiRouteMap;

export async function dispatchApi(req: Request): Promise<Response> {
  return dispatchApiRequest(req);
}
