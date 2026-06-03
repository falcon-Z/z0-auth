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
  handleGetUser,
  handleListUsers,
  handlePatchUser,
} from "./users/handlers";
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

export const v1PatternRoutes: PathRoute[] = [
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
  { pattern: "/api/v1/console/summary", handlers: { GET: handleConsoleSummary } },
  { pattern: "/api/v1/users", handlers: { GET: handleListUsers } },
  { pattern: "/api/v1/users/:userId", handlers: { GET: handleGetUser, PATCH: handlePatchUser } },
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
