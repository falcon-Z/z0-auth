import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { buildDeployStatus } from "../lib/deploy-status";
import { json } from "../lib/http";

export const deployApiRoutes = {
  "/api/deploy/status": {
    async GET() {
      const body: DeployStatusResponse = await buildDeployStatus();
      return json(body);
    },
  },
} as const;
