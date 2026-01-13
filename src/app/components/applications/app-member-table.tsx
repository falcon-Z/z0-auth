/**
 * AppMemberTable component
 * DataTable wrapper for application members with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getAppMemberColumns } from "./app-member-columns";
import type { AppMember } from "@z0/types";

interface AppMemberTableProps {
  /** Members data */
  data: AppMember[];
  /** Loading state */
  loading?: boolean;
  /** Edit role handler */
  onEditRole?: (member: AppMember) => void;
  /** Remove member handler */
  onRemove?: (member: AppMember) => void;
  /** Show action column */
  showActions?: boolean;
  /** Current user ID (to mark "You" badge) */
  currentUserId?: string;
  /** Empty state message */
  emptyMessage?: string;
}

export function AppMemberTable({
  data,
  loading = false,
  onEditRole,
  onRemove,
  showActions = true,
  currentUserId,
  emptyMessage = "No members found.",
}: AppMemberTableProps) {
  const columns = useMemo(
    () =>
      getAppMemberColumns({
        onEditRole,
        onRemove,
        showActions,
        currentUserId,
      }),
    [onEditRole, onRemove, showActions, currentUserId]
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

export type { AppMemberTableProps };
