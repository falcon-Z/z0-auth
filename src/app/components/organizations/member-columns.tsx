/**
 * Member table column definitions
 * Reusable columns for organization member DataTable
 */

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, User } from "lucide-react";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@z0/components/ui/avatar";
import { DataTableColumnHeader } from "@z0/components/data-table/data-table";
import { StatusBadge } from "@z0/components/shared/status-badge";
import { Badge } from "@z0/components/ui/badge";
import type { OrgMember } from "@z0/types";
import { ORG_ROLE_LABELS } from "@z0/types";

interface MemberColumnsOptions {
  onEditRole?: (member: OrgMember) => void;
  onRemove?: (member: OrgMember) => void;
  onResendInvite?: (member: OrgMember) => void;
  showActions?: boolean;
  currentUserId?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getMemberColumns({
  onEditRole,
  onRemove,
  onResendInvite,
  showActions = true,
  currentUserId,
}: MemberColumnsOptions = {}): ColumnDef<OrgMember>[] {
  const columns: ColumnDef<OrgMember>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Member" />
      ),
      cell: ({ row }) => {
        const member = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={member.avatar ?? undefined} alt={member.name} />
              <AvatarFallback>
                {member.name ? getInitials(member.name) : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium flex items-center gap-2">
                {member.name || "Unknown"}
                {member.userId === currentUserId && (
                  <Badge variant="outline" className="text-xs">You</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">{member.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "roleType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role" />
      ),
      cell: ({ row }) => {
        const roleType = row.getValue("roleType") as OrgMember["roleType"];
        return (
          <Badge variant="secondary">
            {ORG_ROLE_LABELS[roleType] || roleType}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "memberStatus",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("memberStatus") as string;
        return <StatusBadge status={status} />;
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "grantedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Joined" />
      ),
      cell: ({ row }) => {
        const date = row.getValue("grantedAt");
        if (!date) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-muted-foreground">
            {new Date(date as string).toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const member = row.original;
        const isCurrentUser = member.userId === currentUserId;
        const isInvited = member.memberStatus === "invited";

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>

              {isInvited && onResendInvite && (
                <DropdownMenuItem onClick={() => onResendInvite(member)}>
                  Resend invitation
                </DropdownMenuItem>
              )}

              {onEditRole && !isCurrentUser && (
                <DropdownMenuItem onClick={() => onEditRole(member)}>
                  Change role
                </DropdownMenuItem>
              )}

              {onRemove && !isCurrentUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRemove(member)}
                    className="text-destructive focus:text-destructive"
                  >
                    {isInvited ? "Cancel invitation" : "Remove member"}
                  </DropdownMenuItem>
                </>
              )}

              {isCurrentUser && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  This is you
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
  }

  return columns;
}

export type { MemberColumnsOptions };
