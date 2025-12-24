import { Hono } from "hono";
import orgCrud from "./crud";
import orgApps from "./apps";
import orgMembers from "./members";
import appMembers from "./app-members";
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
// Each router defines its own paths starting with /:orgId/...
orgRoutes.route("/", orgApps);
orgRoutes.route("/", orgMembers);
orgRoutes.route("/", appMembers); // App memberships (/:orgId/apps/:appId/members)
orgRoutes.route("/", apiKeys);

// RBAC routes
orgRoutes.route("/", scopes);
orgRoutes.route("/", roles);
orgRoutes.route("/", roleScopes);
orgRoutes.route("/", userScopes);

// External providers (OAuth, SAML, LDAP)
orgRoutes.route("/", externalProviders);

export default orgRoutes;
