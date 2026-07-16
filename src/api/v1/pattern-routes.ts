import type { PathRoute } from "../lib/path-router";
import { handleAcceptInvite, handleDeclineInvite, handleInvitePreview } from "./invites/handlers";
import {
  handleCreateInvite,
  handleListInvites,
  handleListMembers,
  handleRemoveMember,
  handleMemberLifecycle,
  handleMemberAdminReset,
  handleRevokeInvite,
} from "./members/handlers";
import {
  handleAcceptAppUserInvite,
  handleAppUserInvitePreview,
  handleDeclineAppUserInvite,
} from "./app-invites/handlers";
import {
  handleCreateAppUser,
  handleCreateAppUserInvite,
  handleGetAppUser,
  handleListAppUserInvites,
  handleListAppUsers,
  handlePatchAppUser,
  handleAppUserLifecycle,
  handleAppUserVerification,
  handleAppUserAdminReset,
  handleRevokeAppUserInvite,
} from "./apps/app-users-handlers";
import {
  handleListSessions,
  handleRevokeOtherSessions,
  handleRevokeSession,
} from "./sessions/handlers";
import { handleConsoleSummary } from "./console/handlers";
import {
  handleCreateRole,
  handleDeleteRole,
  handleGetMemberRoles,
  handleGetRole,
  handleListRbacResources,
  handleListRoles,
  handlePatchRole,
  handleSetMemberRoles,
  handleTransferOwnership,
} from "./rbac/handlers";
import {
  handleCreateApp,
  handleCreateCredential,
  handleGetApp,
  handleListApps,
  handleListCredentials,
  handlePatchApp,
  handleRevokeCredential,
  handleRotateCredential,
} from "./apps/handlers";
import {
  handleCreateScope,
  handleDeleteScope,
  handleListScopes,
  handlePatchScope,
} from "./apps/scopes-handlers";
import {
  handleGetEmailSettings,
  handlePutEmailSettings,
  handleTestEmail,
} from "./settings/handlers";
import {
  handleGetAppSignInSettings,
  handleGetInstanceSignInSettings,
  handlePutAppSignInSettings,
  handlePutInstanceSignInSettings,
} from "./settings/sign-in-handlers";
import {
  handleCreateCustomProvider,
  handleCreateProviderFromTemplate,
  handleDeleteIdentityProvider,
  handleGetIdentityProvider,
  handleListBuiltinTemplates,
  handleListIdentityProviders,
  handlePatchIdentityProvider,
} from "./federation/handlers";
import {
  handleGetAppFederationSettings,
  handlePutAppFederationSettings,
} from "./apps/federation-handlers";
import {
  handleGetFederationUserToken,
  handleRefreshFederationUserToken,
} from "./apps/federation-token-handlers";
import {
  handleCreateServiceGroup,
  handleDeleteServiceGroup,
  handleGetServiceGroup,
  handleListServiceGroups,
  handlePatchServiceGroup,
  handlePutServiceGroupApps,
} from "./service-groups/handlers";
import { handleListAuditEvents } from "./audit/handlers";
import {
  handleListAppUserSessions,
  handleRevokeAppUserSession,
} from "./apps/app-user-sessions-handlers";

export const v1PatternRoutes: PathRoute[] = [
  { pattern: "/api/v1/settings/email/test", handlers: { POST: handleTestEmail } },
  { pattern: "/api/v1/settings/email", handlers: { GET: handleGetEmailSettings, PUT: handlePutEmailSettings } },
  { pattern: "/api/v1/settings/sign-in", handlers: { GET: handleGetInstanceSignInSettings, PUT: handlePutInstanceSignInSettings } },
  { pattern: "/api/v1/federation/providers/templates", handlers: { GET: handleListBuiltinTemplates } },
  { pattern: "/api/v1/federation/providers/from-template", handlers: { POST: handleCreateProviderFromTemplate } },
  { pattern: "/api/v1/federation/providers", handlers: { GET: handleListIdentityProviders, POST: handleCreateCustomProvider } },
  { pattern: "/api/v1/federation/providers/:providerId", handlers: { GET: handleGetIdentityProvider, PATCH: handlePatchIdentityProvider, DELETE: handleDeleteIdentityProvider } },
  { pattern: "/api/v1/service-groups", handlers: { GET: handleListServiceGroups, POST: handleCreateServiceGroup } },
  { pattern: "/api/v1/service-groups/:groupId", handlers: { GET: handleGetServiceGroup, PATCH: handlePatchServiceGroup, DELETE: handleDeleteServiceGroup } },
  { pattern: "/api/v1/service-groups/:groupId/apps", handlers: { PUT: handlePutServiceGroupApps } },
  { pattern: "/api/v1/audit-events", handlers: { GET: handleListAuditEvents } },
  { pattern: "/api/v1/apps", handlers: { GET: handleListApps, POST: handleCreateApp } },
  { pattern: "/api/v1/apps/:appId", handlers: { GET: handleGetApp, PATCH: handlePatchApp } },
  { pattern: "/api/v1/apps/:appId/sign-in", handlers: { GET: handleGetAppSignInSettings, PUT: handlePutAppSignInSettings } },
  { pattern: "/api/v1/apps/:appId/federation", handlers: { GET: handleGetAppFederationSettings, PUT: handlePutAppFederationSettings } },
  {
    pattern: "/api/v1/apps/:appId/users/:userId/federation/:providerId/token",
    handlers: { GET: handleGetFederationUserToken },
  },
  {
    pattern: "/api/v1/apps/:appId/users/:userId/federation/:providerId/token/refresh",
    handlers: { POST: handleRefreshFederationUserToken },
  },
  {
    pattern: "/api/v1/apps/:appId/credentials",
    handlers: { GET: handleListCredentials, POST: handleCreateCredential },
  },
  {
    pattern: "/api/v1/apps/:appId/credentials/:credentialId",
    handlers: { DELETE: handleRevokeCredential },
  },
  {
    pattern: "/api/v1/apps/:appId/credentials/:credentialId/rotate",
    handlers: { POST: handleRotateCredential },
  },
  {
    pattern: "/api/v1/apps/:appId/scopes",
    handlers: { GET: handleListScopes, POST: handleCreateScope },
  },
  {
    pattern: "/api/v1/apps/:appId/scopes/:scopeId",
    handlers: { PATCH: handlePatchScope, DELETE: handleDeleteScope },
  },
  {
    pattern: "/api/v1/apps/:appId/users/invites",
    handlers: { GET: handleListAppUserInvites, POST: handleCreateAppUserInvite },
  },
  {
    pattern: "/api/v1/apps/:appId/users/invites/:inviteId",
    handlers: { DELETE: handleRevokeAppUserInvite },
  },
  {
    pattern: "/api/v1/apps/:appId/users",
    handlers: { GET: handleListAppUsers, POST: handleCreateAppUser },
  },
  {
    pattern: "/api/v1/apps/:appId/users/:userId/sessions",
    handlers: { GET: handleListAppUserSessions },
  },
  {
    pattern: "/api/v1/apps/:appId/users/:userId/sessions/:sessionId",
    handlers: { DELETE: handleRevokeAppUserSession },
  },
  {
    pattern: "/api/v1/apps/:appId/users/:userId/lifecycle/:action",
    handlers: { POST: handleAppUserLifecycle },
  },
  { pattern: "/api/v1/apps/:appId/users/:userId/verification", handlers: { POST: handleAppUserVerification } },
  { pattern: "/api/v1/apps/:appId/users/:userId/password-reset", handlers: { POST: handleAppUserAdminReset } },
  {
    pattern: "/api/v1/apps/:appId/users/:userId",
    handlers: { GET: handleGetAppUser, PATCH: handlePatchAppUser },
  },
  { pattern: "/api/v1/console/summary", handlers: { GET: handleConsoleSummary } },
  { pattern: "/api/v1/rbac/resources", handlers: { GET: handleListRbacResources } },
  { pattern: "/api/v1/rbac/roles", handlers: { GET: handleListRoles, POST: handleCreateRole } },
  { pattern: "/api/v1/rbac/roles/:roleId", handlers: { GET: handleGetRole, PATCH: handlePatchRole, DELETE: handleDeleteRole } },
  { pattern: "/api/v1/members/:userId/roles", handlers: { GET: handleGetMemberRoles, PUT: handleSetMemberRoles } },
  { pattern: "/api/v1/ownership/transfer", handlers: { POST: handleTransferOwnership } },
  { pattern: "/api/v1/app-invites/:token", handlers: { GET: handleAppUserInvitePreview } },
  { pattern: "/api/v1/app-invites/:token/accept", handlers: { POST: handleAcceptAppUserInvite } },
  { pattern: "/api/v1/app-invites/:token/decline", handlers: { POST: handleDeclineAppUserInvite } },
  { pattern: "/api/v1/members", handlers: { GET: handleListMembers } },
  { pattern: "/api/v1/members/invites", handlers: { GET: handleListInvites, POST: handleCreateInvite } },
  { pattern: "/api/v1/members/invites/:inviteId", handlers: { DELETE: handleRevokeInvite } },
  { pattern: "/api/v1/members/:userId/lifecycle/:action", handlers: { POST: handleMemberLifecycle } },
  { pattern: "/api/v1/members/:userId/password-reset", handlers: { POST: handleMemberAdminReset } },
  { pattern: "/api/v1/members/:userId", handlers: { DELETE: handleRemoveMember } },
  { pattern: "/api/v1/invites/:token", handlers: { GET: handleInvitePreview } },
  { pattern: "/api/v1/invites/:token/accept", handlers: { POST: handleAcceptInvite } },
  { pattern: "/api/v1/invites/:token/decline", handlers: { POST: handleDeclineInvite } },
  { pattern: "/api/v1/sessions", handlers: { GET: handleListSessions } },
  { pattern: "/api/v1/sessions/revoke-others", handlers: { POST: handleRevokeOtherSessions } },
  { pattern: "/api/v1/sessions/:sessionId", handlers: { DELETE: handleRevokeSession } },
];
