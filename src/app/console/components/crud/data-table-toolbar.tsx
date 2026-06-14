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
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {enableSearch ? (
        <Input
          placeholder={searchPlaceholder}
          value={(table.getState().globalFilter as string | undefined) ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className="h-9 w-full max-w-sm"
          aria-label={searchPlaceholder}
        />
      ) : null}
      {enableColumnVisibility ? (
        <div className={enableSearch ? "shrink-0 sm:ml-auto" : "ml-auto"}>
          <DataTableViewOptions table={table} />
        </div>
      ) : null}
    </div>
  );
}
