import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";

type DataTablePaginationProps<TData> = {
  table: Table<TData>;
};

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const pageCount = table.getPageCount();

  if (pageCount <= 1 && table.getFilteredRowModel().rows.length <= table.getState().pagination.pageSize) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {table.getFilteredRowModel().rows.length} row
        {table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center gap-4 sm:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[4.5rem]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">First page</span>
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Previous page</span>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-24 text-center text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Next page</span>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Last page</span>
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
