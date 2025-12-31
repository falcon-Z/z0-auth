/**
 * MemberTable component
 * DataTable wrapper for organization members with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/components/data-table/data-table";
import { getMemberColumns } from "./member-columns";
import type { OrgMember } from "@z0/types";

interface MemberTableProps {
  /** Members data */
  data: OrgMember[];
  /** Loading state */
  loading?: boolean;
  /** Edit role handler */
  onEditRole?: (member: OrgMember) => void;
  /** Remove member handler */
  onRemove?: (member: OrgMember) => void;
  /** Resend invitation handler */
  onResendInvite?: (member: OrgMember) => void;
  /** Show action column */
  showActions?: boolean;
  /** Current user ID (to mark "You" badge) */
  currentUserId?: string;
  /** Empty state message */
  emptyMessage?: string;
}

export function MemberTable({
  data,
  loading = false,
  onEditRole,
  onRemove,
  onResendInvite,
  showActions = true,
  currentUserId,
  emptyMessage = "No members found.",
}: MemberTableProps) {
  const columns = useMemo(
    () =>
      getMemberColumns({
        onEditRole,
        onRemove,
        onResendInvite,
        showActions,
        currentUserId,
      }),
    [onEditRole, onRemove, onResendInvite, showActions, currentUserId]
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

export type { MemberTableProps };
