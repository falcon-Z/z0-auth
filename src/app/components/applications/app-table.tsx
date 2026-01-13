/**
 * AppTable component
 * DataTable wrapper for applications with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getAppColumns } from "./app-columns";
import type { AppWithCounts } from "@z0/types";

interface AppTableProps {
  /** Applications data */
  data: AppWithCounts[];
  /** Loading state */
  loading?: boolean;
  /** Edit handler */
  onEdit?: (app: AppWithCounts) => void;
  /** Delete handler */
  onDelete?: (app: AppWithCounts) => void;
  /** View handler (row click or action) */
  onView?: (app: AppWithCounts) => void;
  /** Manage members handler */
  onManageMembers?: (app: AppWithCounts) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function AppTable({
  data,
  loading = false,
  onEdit,
  onDelete,
  onView,
  onManageMembers,
  showActions = true,
  emptyMessage = "No applications found.",
}: AppTableProps) {
  const columns = useMemo(
    () =>
      getAppColumns({
        onEdit,
        onDelete,
        onView,
        onManageMembers,
        showActions,
      }),
    [onEdit, onDelete, onView, onManageMembers, showActions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      onRowClick={onView}
      emptyState={
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      }
    />
  );
}

export type { AppTableProps };
