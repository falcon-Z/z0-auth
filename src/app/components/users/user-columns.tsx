/**
 * Platform user table column definitions
 * Reusable columns for platform users DataTable
 */

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, User, Shield } from "lucide-react";
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
import { DataTableColumnHeader } from "@z0/app/components/data-table/data-table";
import { StatusBadge } from "@z0/app/components/shared/status-badge";
import { Badge } from "@z0/components/ui/badge";
import { PLATFORM_ROLE_LABELS, type PlatformRoleType } from "@z0/types";

/**
 * Platform user type from API response
 */
export interface PlatformUser {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string | null;
  roleType: PlatformRoleType;
  scopes: string[];
  status: string;
  emailVerified: boolean;
  lastLoginAt?: string | null;
  grantedAt: string;
  grantedBy?: string;
  userCreatedAt: string;
}

interface UserColumnsOptions {
  onEditRole?: (user: PlatformUser) => void;
  onRevoke?: (user: PlatformUser) => void;
  onView?: (user: PlatformUser) => void;
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

function getRoleBadgeVariant(roleType: PlatformRoleType): "default" | "secondary" | "outline" {
  switch (roleType) {
    case "SUPER_ADMIN":
      return "default";
    case "ORG_MANAGER":
    case "SECURITY_MANAGER":
      return "secondary";
    default:
      return "outline";
  }
}

export function getUserColumns({
  onEditRole,
  onRevoke,
  onView,
  showActions = true,
  currentUserId,
}: UserColumnsOptions = {}): ColumnDef<PlatformUser>[] {
  const columns: ColumnDef<PlatformUser>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
              <AvatarFallback>
                {user.name ? getInitials(user.name) : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium flex items-center gap-2">
                {user.name || "Unknown"}
                {user.userId === currentUserId && (
                  <Badge variant="outline" className="text-xs">You</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
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
        const roleType = row.getValue("roleType") as PlatformRoleType;
        return (
          <Badge variant={getRoleBadgeVariant(roleType)} className="flex items-center gap-1 w-fit">
            <Shield className="h-3 w-3" />
            {PLATFORM_ROLE_LABELS[roleType] || roleType}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: "lastLoginAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Login" />
      ),
      cell: ({ row }) => {
        const date = row.getValue("lastLoginAt") as string | null;
        if (!date) return <span className="text-muted-foreground">Never</span>;
        return (
          <span className="text-muted-foreground">
            {new Date(date).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      accessorKey: "grantedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Access Granted" />
      ),
      cell: ({ row }) => {
        const date = row.getValue("grantedAt") as string;
        return (
          <span className="text-muted-foreground">
            {new Date(date).toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const user = row.original;
        const isCurrentUser = user.userId === currentUserId;

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

              {onView && (
                <DropdownMenuItem onClick={() => onView(user)}>
                  View details
                </DropdownMenuItem>
              )}

              {onEditRole && !isCurrentUser && (
                <DropdownMenuItem onClick={() => onEditRole(user)}>
                  Change role
                </DropdownMenuItem>
              )}

              {onRevoke && !isCurrentUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRevoke(user)}
                    className="text-destructive focus:text-destructive"
                  >
                    Revoke access
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

export type { UserColumnsOptions };
