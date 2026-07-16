import { useCallback, useEffect, useState } from "react";

import type { CreateInviteRequest, CreateInviteResponse, InstanceMember, PendingInvite } from "@z0/contracts/invites";

import { ApiError } from "../lib/api";
import {
  createInstanceInvite,
  fetchInstanceMembers,
  fetchPendingInvites,
  revokeInstanceInvite,
} from "../lib/members-api";

type MembersDataState = {
  members: InstanceMember[];
  invites: PendingInvite[];
  loading: boolean;
  error: string | null;
};

export function useMembersData() {
  const [state, setState] = useState<MembersDataState>({
    members: [],
    invites: [],
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [currentMembers, deletedMembers, invites] = await Promise.all([
        fetchInstanceMembers(),
        fetchInstanceMembers("deleted"),
        fetchPendingInvites(),
      ]);
      setState({
        members: [...currentMembers, ...deletedMembers],
        invites,
        loading: false,
        error: null,
      });
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 403) {
        setState({
          members: [],
          invites: [],
          loading: false,
          error: "You do not have access to members.",
        });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Could not load members",
      }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitInvite = useCallback(
    async (body: CreateInviteRequest): Promise<CreateInviteResponse> => {
      const result = await createInstanceInvite(body);
      await reload();
      return result;
    },
    [reload],
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      await revokeInstanceInvite(inviteId);
      await reload();
    },
    [reload],
  );

  return { ...state, reload, submitInvite, revokeInvite };
}
