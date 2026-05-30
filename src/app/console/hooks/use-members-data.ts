import { useCallback, useEffect, useState } from "react";

import type { CreateInviteRequest, CreateInviteResponse, PendingInvite, RoleSummary, TenantMember } from "@z0/contracts/invites";

import { ApiError } from "../lib/api";
import {
  createTenantInvite,
  fetchPendingInvites,
  fetchTenantMembers,
  fetchTenantRoles,
  revokeTenantInvite,
} from "../lib/members-api";

type MembersDataState = {
  members: TenantMember[];
  invites: PendingInvite[];
  roles: RoleSummary[];
  loading: boolean;
  forbidden: boolean;
  error: string | null;
};

export function useMembersData(tenantId: string | undefined, canReadMembers: boolean, canInviteMembers: boolean) {
  const [state, setState] = useState<MembersDataState>({
    members: [],
    invites: [],
    roles: [],
    loading: true,
    forbidden: false,
    error: null,
  });

  const reload = useCallback(async () => {
    if (!tenantId || !canReadMembers) {
      setState((prev) => ({
        ...prev,
        loading: false,
        forbidden: !tenantId ? false : !canReadMembers,
        members: [],
        invites: [],
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, forbidden: false, error: null }));

    try {
      const membersPromise = fetchTenantMembers(tenantId);
      const rolesPromise = fetchTenantRoles();
      const invitesPromise = canInviteMembers
        ? fetchPendingInvites(tenantId).catch((e) => {
            if (e instanceof ApiError && e.problem.status === 403) return [];
            throw e;
          })
        : Promise.resolve([]);

      const [members, roles, invites] = await Promise.all([membersPromise, rolesPromise, invitesPromise]);

      setState({
        members,
        invites,
        roles,
        loading: false,
        forbidden: false,
        error: null,
      });
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 403) {
        setState({
          members: [],
          invites: [],
          roles: [],
          loading: false,
          forbidden: true,
          error: null,
        });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Could not load members",
      }));
    }
  }, [tenantId, canReadMembers, canInviteMembers]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitInvite = useCallback(
    async (body: CreateInviteRequest): Promise<CreateInviteResponse> => {
      if (!tenantId) throw new Error("No active tenant");
      const result = await createTenantInvite(tenantId, body);
      await reload();
      return result;
    },
    [tenantId, reload],
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      if (!tenantId) return;
      await revokeTenantInvite(tenantId, inviteId);
      await reload();
    },
    [tenantId, reload],
  );

  return { ...state, reload, submitInvite, revokeInvite };
}
