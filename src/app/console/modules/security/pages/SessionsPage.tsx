import { useCallback, useEffect, useState } from "react";

import type { SessionSummary } from "@z0/contracts/sessions";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ApiError } from "../../../lib/api";
import { fetchSessions, revokeOtherSessions, revokeSession } from "../../../lib/sessions-api";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchSessions());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRevoke(row: SessionSummary) {
    const label = row.isCurrent ? "this device" : row.clientLabel;
    if (!window.confirm(`Sign out ${label}?`)) return;

    setBusyId(row.id);
    setActionError(null);
    try {
      const result = await revokeSession(row.id);
      if (result.revokedCurrent) {
        window.location.href = "/auth/login";
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== row.id));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not revoke session.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeOthers() {
    const others = sessions.filter((s) => !s.isCurrent).length;
    if (others === 0) return;
    if (
      !window.confirm(
        `Sign out ${others} other ${others === 1 ? "session" : "sessions"}? This device will stay signed in.`,
      )
    ) {
      return;
    }

    setRevokingOthers(true);
    setActionError(null);
    try {
      await revokeOtherSessions();
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not sign out other sessions.");
    } finally {
      setRevokingOthers(false);
    }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <ListPageHeader title="Sessions" />
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Sessions"
        actions={
          otherCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={revokingOthers}
              onClick={() => void handleRevokeOthers()}
            >
              Sign out other sessions
            </Button>
          ) : null
        }
      />

      <p className="text-sm text-muted-foreground">
        Devices where you are signed in. Sign out any session you do not recognize.
      </p>

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable<SessionSummary>
        columns={[
          {
            id: "device",
            header: "Device",
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
            cell: (row) => row.ipDisplay ?? "—",
          },
          {
            id: "lastSeen",
            header: "Last active",
            cell: (row) => formatWhen(row.lastSeenAt),
          },
          {
            id: "created",
            header: "Signed in",
            cell: (row) => formatWhen(row.createdAt),
          },
        ]}
        rows={sessions}
        rowKey={(row) => row.id}
        emptyMessage="No active sessions."
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
