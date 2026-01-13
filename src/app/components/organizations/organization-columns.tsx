/**
 * Organization table column definitions
 * Reusable columns for organization DataTable
 */

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Building2, Users, AppWindow } from "lucide-react";
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
import type { OrganizationWithCounts } from "@z0/types";

interface OrganizationColumnsOptions {
  onEdit?: (org: OrganizationWithCounts) => void;
  onDelete?: (org: OrganizationWithCounts) => void;
  onView?: (org: OrganizationWithCounts) => void;
  showActions?: boolean;
}

export function getOrganizationColumns({
  onEdit,
  onDelete,
  onView,
  showActions = true,
}: OrganizationColumnsOptions = {}): ColumnDef<OrganizationWithCounts>[] {
  const columns: ColumnDef<OrganizationWithCounts>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">{org.name}</div>
              <div className="text-sm text-muted-foreground">{org.slug}</div>
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
      accessorKey: "appCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Apps" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <AppWindow className="h-4 w-4 text-muted-foreground" />
          <span>{row.getValue("appCount")}</span>
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
        const org = row.original;

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
                <DropdownMenuItem onClick={() => onView(org)}>
                  View details
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(org)}>
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(org)}
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

export type { OrganizationColumnsOptions };
