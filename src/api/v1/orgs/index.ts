import { Hono } from "hono";
import orgCrud from "./crud";
import orgApps from "./apps";
import orgMembers from "./members";
import apiKeys from "./api-keys";
import scopes from "./scopes";
import roles from "./roles";
import roleScopes from "./role-scopes";
import userScopes from "./user-scopes";
import externalProviders from "./external-providers";

const orgRoutes = new Hono();

// Mount CRUD routes first (handles GET /api/v1/orgs, POST /api/v1/orgs, etc.)
orgRoutes.route("/", orgCrud);

// Mount sub-routers
// Route is /api/v1/orgs/...
// So orgApps handles /:orgId/apps
// We mount it at root so it captures parameters?
// Hono behavior:
// If we mount at "/", inside orgApps we need to handle full path or parameter?
// Better: Mount at "/" and let orgApps define "/:orgId/apps"
orgRoutes.route("/", orgApps);
orgRoutes.route("/", orgMembers);
orgRoutes.route("/", apiKeys);

// RBAC routes
orgRoutes.route("/", scopes);
orgRoutes.route("/", roles);
orgRoutes.route("/", roleScopes);
orgRoutes.route("/", userScopes);

// External providers (OAuth, SAML, LDAP)
orgRoutes.route("/", externalProviders);

export default orgRoutes;
