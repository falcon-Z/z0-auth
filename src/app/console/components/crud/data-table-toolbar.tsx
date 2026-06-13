import type { Table } from "@tanstack/react-table";

import { Input } from "@z0/components/ui/input";
import { DataTableViewOptions } from "./data-table-view-options";

type DataTableToolbarProps<TData> = {
  table: Table<TData>;
  searchPlaceholder?: string;
  enableSearch?: boolean;
  enableColumnVisibility?: boolean;
};

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = "Search…",
  enableSearch = true,
  enableColumnVisibility = true,
}: DataTableToolbarProps<TData>) {
  if (!enableSearch && !enableColumnVisibility) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {enableSearch ? (
        <Input
          placeholder={searchPlaceholder}
          value={(table.getState().globalFilter as string | undefined) ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className="h-9 max-w-sm"
        />
      ) : null}
      {enableColumnVisibility ? <DataTableViewOptions table={table} /> : null}
    </div>
  );
}
