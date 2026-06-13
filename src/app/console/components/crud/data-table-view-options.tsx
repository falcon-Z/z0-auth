import type { Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>;
};

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
  const hideable = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide());

  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="ml-auto">
          <Settings2 className="size-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => {
          const label =
            (column.columnDef.meta as { title?: string } | undefined)?.title ??
            (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id);
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
