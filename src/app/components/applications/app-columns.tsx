/**
 * Application table column definitions
 * Reusable columns for application DataTable
 */

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, AppWindow, Users } from "lucide-react";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@z0/app/components/data-table/data-table";
import { StatusBadge } from "@z0/app/components/shared/status-badge";
import type { AppWithCounts } from "@z0/types";

interface AppColumnsOptions {
  onEdit?: (app: AppWithCounts) => void;
  onDelete?: (app: AppWithCounts) => void;
  onView?: (app: AppWithCounts) => void;
  onManageMembers?: (app: AppWithCounts) => void;
  showActions?: boolean;
}

export function getAppColumns({
  onEdit,
  onDelete,
  onView,
  onManageMembers,
  showActions = true,
}: AppColumnsOptions = {}): ColumnDef<AppWithCounts>[] {
  const columns: ColumnDef<AppWithCounts>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <AppWindow className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">{app.name}</div>
              <div className="text-sm text-muted-foreground">{app.slug}</div>
            </div>
          </div>
        );
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
      accessorKey: "memberCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Members" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{row.getValue("memberCount")}</span>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <span className="text-muted-foreground">
            {date.toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const app = row.original;

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
                <DropdownMenuItem onClick={() => onView(app)}>
                  View details
                </DropdownMenuItem>
              )}
              {onManageMembers && (
                <DropdownMenuItem onClick={() => onManageMembers(app)}>
                  Manage members
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(app)}>
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(app)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
  }

  return columns;
}

export type { AppColumnsOptions };
