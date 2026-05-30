import type { PathRoute } from "../lib/path-router";
import { handleAcceptInvite, handleDeclineInvite, handleInvitePreview } from "./invites/handlers";
import { handleListRoles } from "./roles/handlers";
import {
  handleCreateInvite,
  handleListInvites,
  handleListMembers,
  handleRemoveMember,
  handleRevokeInvite,
  handleUpdateMemberRoles,
} from "./tenants/handlers";

export const v1PatternRoutes: PathRoute[] = [
  { pattern: "/api/v1/roles", handlers: { GET: handleListRoles } },
  { pattern: "/api/v1/tenants/:tenantId/members", handlers: { GET: handleListMembers } },
  { pattern: "/api/v1/tenants/:tenantId/members/:userId/roles", handlers: { PATCH: handleUpdateMemberRoles } },
  { pattern: "/api/v1/tenants/:tenantId/members/:userId", handlers: { DELETE: handleRemoveMember } },
  { pattern: "/api/v1/tenants/:tenantId/invites", handlers: { GET: handleListInvites, POST: handleCreateInvite } },
  { pattern: "/api/v1/tenants/:tenantId/invites/:inviteId", handlers: { DELETE: handleRevokeInvite } },
  { pattern: "/api/v1/invites/:token", handlers: { GET: handleInvitePreview } },
  { pattern: "/api/v1/invites/:token/accept", handlers: { POST: handleAcceptInvite } },
  { pattern: "/api/v1/invites/:token/decline", handlers: { POST: handleDeclineInvite } },
];
