import type { ReactNode } from "react";

import { Card } from "@z0/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@z0/components/ui/table";
import { EmptyState } from "../feedback/EmptyState";
import { cn } from "../../lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
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
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  emptyMessage = "No rows",
  emptyAction,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
            {columns.map((col) => (
              <TableHead
                key={col.id}
                scope="col"
                className={cn("h-auto px-4 py-3 text-muted-foreground", col.className)}
              >
                {col.header}
              </TableHead>
            ))}
            {rowActions ? (
              <TableHead scope="col" className="h-auto px-4 py-3 text-right text-muted-foreground">
                Actions
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={cn("group", onRowClick && "cursor-pointer hover:bg-muted/30")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((col, index) => (
                <TableCell key={col.id} className={cn("px-4 py-3", col.className)}>
                  {index === 0 && onRowClick ? (
                    <span className="font-medium group-hover:underline">{col.cell(row)}</span>
                  ) : (
                    col.cell(row)
                  )}
                </TableCell>
              ))}
              {rowActions ? (
                <TableCell
                  className="px-4 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-1">{rowActions(row)}</div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
