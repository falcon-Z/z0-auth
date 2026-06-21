import { useCallback, useEffect, useState } from "react";

import type { AuditEventSummary } from "@z0/contracts/audit";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import {
  fetchAuditEvents,
  formatAuditAction,
  formatAuditActor,
} from "../../../lib/audit-api";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatResource(event: AuditEventSummary): string {
  if (event.resourceId) return `${event.resourceType} · ${event.resourceId.slice(0, 8)}…`;
  return event.resourceType;
}

export function ActivityPage() {
  const [events, setEvents] = useState<AuditEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (opts?: { before?: string; append?: boolean }) => {
    if (opts?.append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const result = await fetchAuditEvents({
        limit: 50,
        before: opts?.before,
      });
      setHasMore(result.hasMore);
      setEvents((prev) => (opts?.append ? [...prev, ...result.events] : result.events));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load activity.");
    } finally {
      if (opts?.append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Activity" />
        <ListPageSkeleton />
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Activity" />
        <PageError message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const lastEvent = events.at(-1);

  return (
    <div className="space-y-6">
      <ListPageHeader title="Activity" />
      <p className="text-sm text-muted-foreground">
        Sign-ins and configuration changes on this instance.
      </p>

      {error ? <PageError message={error} /> : null}

      <DataTable<AuditEventSummary>
        columns={[
          {
            id: "when",
            header: "When",
            accessorFn: (row) => new Date(row.createdAt).getTime(),
            cell: (row) => formatWhen(row.createdAt),
          },
          {
            id: "action",
            header: "Event",
            accessorFn: (row) => formatAuditAction(row.action),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{formatAuditAction(row.action)}</span>
                <span className="text-xs text-muted-foreground">{formatResource(row)}</span>
              </div>
            ),
          },
          {
            id: "actor",
            header: "Actor",
            accessorFn: (row) => formatAuditActor(row.actorName, row.actorEmail),
            cell: (row) => formatAuditActor(row.actorName, row.actorEmail),
          },
        ]}
        rows={events}
        rowKey={(row) => row.id}
        emptyMessage="No activity recorded yet"
      />

      {hasMore && lastEvent ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void load({ before: lastEvent.createdAt, append: true })}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
