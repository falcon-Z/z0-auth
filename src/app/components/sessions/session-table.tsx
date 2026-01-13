/**
 * SessionTable component
 * DataTable wrapper for user sessions with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getSessionColumns, type Session } from "./session-columns";

interface SessionTableProps {
  /** Sessions data */
  data: Session[];
  /** Loading state */
  loading?: boolean;
  /** Revoke session handler */
  onRevoke?: (session: Session) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function SessionTable({
  data,
  loading = false,
  onRevoke,
  showActions = true,
  emptyMessage = "No active sessions found.",
}: SessionTableProps) {
  const columns = useMemo(
    () =>
      getSessionColumns({
        onRevoke,
        showActions,
      }),
    [onRevoke, showActions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      emptyState={
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      }
    />
  );
}

export type { SessionTableProps };
