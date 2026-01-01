/**
 * Role column definitions for DataTable
 */

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Users, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystemRole: boolean;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleColumnsOptions {
  onEdit?: (role: Role) => void;
  onDelete?: (role: Role) => void;
  onViewMembers?: (role: Role) => void;
  showActions?: boolean;
}

export function getRoleColumns(options: RoleColumnsOptions = {}): ColumnDef<Role>[] {
  const { onEdit, onDelete, onViewMembers, showActions = true } = options;

  const columns: ColumnDef<Role>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.original.name}</span>
          {row.original.isSystemRole && (
            <Badge variant="secondary" className="text-xs">
              System
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-muted-foreground line-clamp-1">
          {row.original.description || "No description"}
        </span>
      ),
    },
    {
      accessorKey: "permissions",
      header: "Permissions",
      cell: ({ row }) => {
        const permissions = row.original.permissions;
        if (!permissions?.length) {
          return <span className="text-muted-foreground">No permissions</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {permissions.slice(0, 3).map((perm) => (
              <Badge key={perm} variant="outline" className="text-xs">
                {perm}
              </Badge>
            ))}
            {permissions.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{permissions.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "memberCount",
      header: "Members",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{row.original.memberCount ?? 0}</span>
        </div>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Last Updated",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.updatedAt), { addSuffix: true })}
        </span>
      ),
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const role = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onViewMembers && (
                <DropdownMenuItem onClick={() => onViewMembers(role)}>
                  <Users className="mr-2 h-4 w-4" />
                  View Members
                </DropdownMenuItem>
              )}
              {onEdit && !role.isSystemRole && (
                <DropdownMenuItem onClick={() => onEdit(role)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Role
                </DropdownMenuItem>
              )}
              {onEdit && role.isSystemRole && (
                <DropdownMenuItem disabled>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Role (System)
                </DropdownMenuItem>
              )}
              {(onEdit || onViewMembers) && onDelete && <DropdownMenuSeparator />}
              {onDelete && !role.isSystemRole && (
                <DropdownMenuItem
                  onClick={() => onDelete(role)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Role
                </DropdownMenuItem>
              )}
              {onDelete && role.isSystemRole && (
                <DropdownMenuItem disabled>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Role (System)
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
