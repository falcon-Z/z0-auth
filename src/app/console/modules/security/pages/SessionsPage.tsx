import { useCallback, useEffect, useState } from "react";

import type { SessionSummary } from "@z0/contracts/sessions";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { useSession } from "../../../context/session-context";
import { fetchSessions, revokeOtherSessions, revokeSession } from "../../../lib/sessions-api";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type SessionsPageProps = {
  embedded?: boolean;
};

export function SessionsPage({ embedded = false }: SessionsPageProps) {
  const confirm = useConfirm();
  const { signOut } = useSession();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setSessions(await fetchSessions());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sessions.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRevoke(row: SessionSummary) {
    const label = row.isCurrent ? "this device" : row.clientLabel;
    const ok = await confirm({
      title: row.isCurrent ? "Sign out" : "Revoke session",
      description: `Sign out ${label}?`,
      confirmLabel: row.isCurrent ? "Sign out" : "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(row.id);
    setActionError(null);
    setNotice(null);
    try {
      const result = await revokeSession(row.id);
      if (result.revokedCurrent) {
        await signOut();
        return;
      }
      setNotice("Session revoked.");
      await reload({ silent: true });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not revoke session.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeOthers() {
    const others = sessions.filter((s) => !s.isCurrent).length;
    if (others === 0) return;

    const ok = await confirm({
      title: "Sign out other sessions",
      description: `Sign out ${others} other ${others === 1 ? "session" : "sessions"}? This device stays signed in.`,
      confirmLabel: "Sign out others",
      destructive: true,
    });
    if (!ok) return;

    setRevokingOthers(true);
    setActionError(null);
    setNotice(null);
    try {
      await revokeOtherSessions();
      setNotice("Other sessions signed out.");
      await reload({ silent: true });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not sign out other sessions.");
    } finally {
      setRevokingOthers(false);
    }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  const revokeOthersAction =
    otherCount > 0 ? (
      <Button
        type="button"
        variant="outline"
        disabled={revokingOthers}
        onClick={() => void handleRevokeOthers()}
      >
        Sign out others
      </Button>
    ) : undefined;

  if (loading) {
    return (
      <div className="space-y-6">
        {!embedded ? (
          <DetailPageHeader title="Sessions" />
        ) : null}
        <ListPageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {!embedded ? (
          <DetailPageHeader title="Sessions" />
        ) : null}
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <DetailPageHeader title="Sessions" actions={revokeOthersAction} />
      ) : revokeOthersAction ? (
        <div className="flex justify-end">{revokeOthersAction}</div>
      ) : null}

      {embedded ? (
        <p className="text-sm text-muted-foreground">
          Devices and browsers where you are signed in to this account.
        </p>
      ) : null}

      <ActionNotice message={notice} />

      {actionError ? <PageError message={actionError} /> : null}

      <DataTable<SessionSummary>
        columns={[
          {
            id: "device",
            header: "Device",
            accessorFn: (row) => row.clientLabel,
            cell: (row) => (
              <div className="flex flex-col gap-1">
                <span className="font-medium">{row.clientLabel}</span>
                {row.isCurrent ? (
                  <Badge variant="secondary" className="w-fit">
                    This device
                  </Badge>
                ) : null}
              </div>
            ),
          },
          {
            id: "location",
            header: "Network",
            accessorFn: (row) => row.ipDisplay ?? "",
            cell: (row) => row.ipDisplay ?? "—",
          },
          {
            id: "lastSeen",
            header: "Last active",
            accessorFn: (row) => new Date(row.lastSeenAt).getTime(),
            cell: (row) => formatWhen(row.lastSeenAt),
          },
          {
            id: "created",
            header: "Signed in",
            accessorFn: (row) => new Date(row.createdAt).getTime(),
            cell: (row) => formatWhen(row.createdAt),
          },
        ]}
        rows={sessions}
        rowKey={(row) => row.id}
        emptyMessage="No active sessions"
        rowActions={(row) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyId === row.id}
            onClick={() => void handleRevoke(row)}
          >
            {row.isCurrent ? "Sign out" : "Revoke"}
          </Button>
        )}
      />
    </div>
  );
}
