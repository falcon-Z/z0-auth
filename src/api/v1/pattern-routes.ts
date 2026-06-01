import type { PathRoute } from "../lib/path-router";
import { handleAcceptInvite, handleDeclineInvite, handleInvitePreview } from "./invites/handlers";
import { handleListRoles } from "./roles/handlers";
import {
  handleCreateInvite,
  handleCreateTenant,
  handleListInvites,
  handleListMembers,
  handleListTenants,
  handleRemoveMember,
  handleRevokeInvite,
  handleUpdateMemberRoles,
} from "./tenants/handlers";

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

export const v1PatternRoutes: PathRoute[] = [
  { pattern: "/api/v1/users", handlers: { GET: handleListUsers } },
  { pattern: "/api/v1/users/:userId", handlers: { GET: handleGetUser, PATCH: handlePatchUser } },
  { pattern: "/api/v1/roles", handlers: { GET: handleListRoles } },
  { pattern: "/api/v1/tenants", handlers: { GET: handleListTenants, POST: handleCreateTenant } },
  { pattern: "/api/v1/tenants/:tenantId/members", handlers: { GET: handleListMembers } },
  { pattern: "/api/v1/tenants/:tenantId/members/:userId/roles", handlers: { PATCH: handleUpdateMemberRoles } },
  { pattern: "/api/v1/tenants/:tenantId/members/:userId", handlers: { DELETE: handleRemoveMember } },
  { pattern: "/api/v1/tenants/:tenantId/invites", handlers: { GET: handleListInvites, POST: handleCreateInvite } },
  { pattern: "/api/v1/tenants/:tenantId/invites/:inviteId", handlers: { DELETE: handleRevokeInvite } },
  { pattern: "/api/v1/invites/:token", handlers: { GET: handleInvitePreview } },
  { pattern: "/api/v1/invites/:token/accept", handlers: { POST: handleAcceptInvite } },
  { pattern: "/api/v1/invites/:token/decline", handlers: { POST: handleDeclineInvite } },
  { pattern: "/api/v1/sessions", handlers: { GET: handleListSessions } },
  { pattern: "/api/v1/sessions/revoke-others", handlers: { POST: handleRevokeOtherSessions } },
  { pattern: "/api/v1/sessions/:sessionId", handlers: { DELETE: handleRevokeSession } },
];
