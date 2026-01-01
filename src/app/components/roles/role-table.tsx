/**
 * RoleTable component
 * DataTable wrapper for roles with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getRoleColumns, type Role } from "./role-columns";

interface RoleTableProps {
  /** Roles data */
  data: Role[];
  /** Loading state */
  loading?: boolean;
  /** Edit role handler */
  onEdit?: (role: Role) => void;
  /** Delete role handler */
  onDelete?: (role: Role) => void;
  /** View members handler */
  onViewMembers?: (role: Role) => void;
  /** Row click handler */
  onRowClick?: (role: Role) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function RoleTable({
  data,
  loading = false,
  onEdit,
  onDelete,
  onViewMembers,
  onRowClick,
  showActions = true,
  emptyMessage = "No roles found.",
}: RoleTableProps) {
  const columns = useMemo(
    () =>
      getRoleColumns({
        onEdit,
        onDelete,
        onViewMembers,
        showActions,
      }),
    [onEdit, onDelete, onViewMembers, showActions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      onRowClick={onRowClick}
      emptyState={
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      }
    />
  );
}

export type { RoleTableProps };
