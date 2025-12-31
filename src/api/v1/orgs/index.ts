import { Hono } from "hono";
import orgApps from "./apps";
import orgMembers from "./members";
import appMembers from "./app-members";
import apiKeys from "./api-keys";
import scopes from "./scopes";
import roles from "./roles";
import roleScopes from "./role-scopes";
import userScopes from "./user-scopes";
import externalProviders from "./external-providers";
import webhooks from "./webhooks";
import invitations from "./invitations";
import metadataSchemas from "./metadata-schemas";
import appScopes from "./app-scopes";
import batch from "./batch";

const orgRoutes = new Hono();

// Note: Organization CRUD operations moved to /api/v1/platform/organizations
// This router handles org-scoped operations (/:orgId/...)

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

// Webhooks
orgRoutes.route("/", webhooks);

// Invitations
orgRoutes.route("/", invitations);

// User metadata schemas
orgRoutes.route("/", metadataSchemas);

// App scopes management
orgRoutes.route("/", appScopes);

// Batch operations
orgRoutes.route("/", batch);

export default orgRoutes;
