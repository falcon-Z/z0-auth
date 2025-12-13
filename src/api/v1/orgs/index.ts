import { Hono } from "hono";
import orgApps from "./apps";
import orgMembers from "./members";

const orgRoutes = new Hono();

// Mount sub-routers
// Route is /api/v1/orgs/...
// So orgApps handles /:orgId/apps
// We mount it at root so it captures parameters?
// Hono behavior: 
// If we mount at "/", inside orgApps we need to handle full path or parameter?
// Better: Mount at "/" and let orgApps define "/:orgId/apps"
orgRoutes.route("/", orgApps);
orgRoutes.route("/", orgMembers);

export default orgRoutes;
