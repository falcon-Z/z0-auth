import type { PathRoute } from "../lib/path-router";
import { handleAcceptInvite, handleDeclineInvite, handleInvitePreview } from "./invites/handlers";
import {
  handleCreateInvite,
  handleListInvites,
  handleListMembers,
  handleRemoveMember,
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
  handleRevokeAppUserInvite,
} from "./apps/app-users-handlers";
import {
  handleListSessions,
  handleRevokeOtherSessions,
  handleRevokeSession,
} from "./sessions/handlers";
import { handleConsoleSummary } from "./console/handlers";
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

export const v1PatternRoutes: PathRoute[] = [
  { pattern: "/api/v1/settings/email/test", handlers: { POST: handleTestEmail } },
  { pattern: "/api/v1/settings/email", handlers: { GET: handleGetEmailSettings, PUT: handlePutEmailSettings } },
  { pattern: "/api/v1/apps", handlers: { GET: handleListApps, POST: handleCreateApp } },
  { pattern: "/api/v1/apps/:appId", handlers: { GET: handleGetApp, PATCH: handlePatchApp } },
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
    pattern: "/api/v1/apps/:appId/users/:userId",
    handlers: { GET: handleGetAppUser, PATCH: handlePatchAppUser },
  },
  { pattern: "/api/v1/console/summary", handlers: { GET: handleConsoleSummary } },
  { pattern: "/api/v1/app-invites/:token", handlers: { GET: handleAppUserInvitePreview } },
  { pattern: "/api/v1/app-invites/:token/accept", handlers: { POST: handleAcceptAppUserInvite } },
  { pattern: "/api/v1/app-invites/:token/decline", handlers: { POST: handleDeclineAppUserInvite } },
  { pattern: "/api/v1/members", handlers: { GET: handleListMembers } },
  { pattern: "/api/v1/members/invites", handlers: { GET: handleListInvites, POST: handleCreateInvite } },
  { pattern: "/api/v1/members/invites/:inviteId", handlers: { DELETE: handleRevokeInvite } },
  { pattern: "/api/v1/members/:userId", handlers: { DELETE: handleRemoveMember } },
  { pattern: "/api/v1/invites/:token", handlers: { GET: handleInvitePreview } },
  { pattern: "/api/v1/invites/:token/accept", handlers: { POST: handleAcceptInvite } },
  { pattern: "/api/v1/invites/:token/decline", handlers: { POST: handleDeclineInvite } },
  { pattern: "/api/v1/sessions", handlers: { GET: handleListSessions } },
  { pattern: "/api/v1/sessions/revoke-others", handlers: { POST: handleRevokeOtherSessions } },
  { pattern: "/api/v1/sessions/:sessionId", handlers: { DELETE: handleRevokeSession } },
];
