import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";

import { Card } from "@z0/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@z0/components/ui/table";
import { cn } from "../../lib/utils";
import { EmptyState } from "../feedback/EmptyState";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for sorting and filtering. Required for sortable columns. */
  accessorFn?: (row: T) => string | number | boolean | Date | null | undefined;
  enableSorting?: boolean;
  enableHiding?: boolean;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  searchPlaceholder?: string;
  enableToolbar?: boolean;
  enableSearch?: boolean;
  enableColumnVisibility?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
};

function buildColumnDefs<T>(
  columns: DataTableColumn<T>[],
  rowActions?: (row: T) => ReactNode,
): ColumnDef<T>[] {
  const defs: ColumnDef<T>[] = columns.map((col) => {
    const canSort = col.enableSorting ?? Boolean(col.accessorFn);
    return {
      id: col.id,
      accessorFn: col.accessorFn,
      enableSorting: canSort,
      enableHiding: col.enableHiding ?? true,
      meta: {
        className: col.className,
        title: col.header,
      },
      header: ({ column }) =>
        canSort ? (
          <DataTableColumnHeader column={column} title={col.header} className={col.className} />
        ) : (
          <span className={col.className}>{col.header}</span>
        ),
      cell: ({ row }) => col.cell(row.original),
    };
  });

  if (rowActions) {
    defs.push({
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="text-right">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">{rowActions(row.original)}</div>
      ),
    });
  }

  return defs;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  emptyMessage = "No rows",
  emptyAction,
  searchPlaceholder,
  enableToolbar = true,
  enableSearch = true,
  enableColumnVisibility = true,
  enablePagination = true,
  pageSize = 10,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columnDefs = useMemo(
    () => buildColumnDefs(columns, rowActions),
    [columns, rowActions],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getRowId: (row) => rowKey(row),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
    initialState: {
      pagination: { pageSize },
    },
  });

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  const showToolbar =
    enableToolbar && (enableSearch || enableColumnVisibility) && columnDefs.some((c) => c.id !== "actions");

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <DataTableToolbar
          table={table}
          searchPlaceholder={searchPlaceholder}
          enableSearch={enableSearch}
          enableColumnVisibility={enableColumnVisibility}
        />
      ) : null}

      <Card className="gap-0 overflow-hidden py-0 shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={cn(
                      "h-auto px-4 py-3 text-muted-foreground",
                      header.column.id === "actions" && "text-right",
                      (header.column.columnDef.meta as { className?: string } | undefined)?.className,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnDefs.length} className="h-24 text-center text-muted-foreground">
                  No results match your search.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("group", onRowClick && "cursor-pointer hover:bg-muted/30")}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-4 py-3",
                        cell.column.id === "actions" && "text-right",
                        (cell.column.columnDef.meta as { className?: string } | undefined)?.className,
                      )}
                      onClick={cell.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
                      onKeyDown={cell.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
                    >
                      {index === 0 && onRowClick && cell.column.id !== "actions" ? (
                        <span className="font-medium group-hover:underline">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {enablePagination ? <DataTablePagination table={table} /> : null}
    </div>
  );
}
