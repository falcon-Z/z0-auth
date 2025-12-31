/**
 * OrganizationTable component
 * DataTable wrapper for organizations with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/components/data-table/data-table";
import { getOrganizationColumns } from "./organization-columns";
import type { OrganizationWithCounts } from "@z0/types";

interface OrganizationTableProps {
  /** Organizations data */
  data: OrganizationWithCounts[];
  /** Loading state */
  loading?: boolean;
  /** Edit handler */
  onEdit?: (org: OrganizationWithCounts) => void;
  /** Delete handler */
  onDelete?: (org: OrganizationWithCounts) => void;
  /** View handler (row click or action) */
  onView?: (org: OrganizationWithCounts) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function OrganizationTable({
  data,
  loading = false,
  onEdit,
  onDelete,
  onView,
  showActions = true,
  emptyMessage = "No organizations found.",
}: OrganizationTableProps) {
  const columns = useMemo(
    () =>
      getOrganizationColumns({
        onEdit,
        onDelete,
        onView,
        showActions,
      }),
    [onEdit, onDelete, onView, showActions]
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

export type { OrganizationTableProps };
