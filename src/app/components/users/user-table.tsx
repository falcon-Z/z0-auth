/**
 * UserTable component
 * DataTable wrapper for platform users with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getUserColumns, type PlatformUser } from "./user-columns";

interface UserTableProps {
  /** Platform users data */
  data: PlatformUser[];
  /** Loading state */
  loading?: boolean;
  /** Edit role handler */
  onEditRole?: (user: PlatformUser) => void;
  /** Revoke access handler */
  onRevoke?: (user: PlatformUser) => void;
  /** View handler */
  onView?: (user: PlatformUser) => void;
  /** Show action column */
  showActions?: boolean;
  /** Current user ID (to mark "You" badge) */
  currentUserId?: string;
  /** Empty state message */
  emptyMessage?: string;
}

export function UserTable({
  data,
  loading = false,
  onEditRole,
  onRevoke,
  onView,
  showActions = true,
  currentUserId,
  emptyMessage = "No platform users found.",
}: UserTableProps) {
  const columns = useMemo(
    () =>
      getUserColumns({
        onEditRole,
        onRevoke,
        onView,
        showActions,
        currentUserId,
      }),
    [onEditRole, onRevoke, onView, showActions, currentUserId]
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

export type { UserTableProps };
