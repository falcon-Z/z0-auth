/**
 * API Key column definitions for DataTable
 */

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { MoreHorizontal, Copy, Trash2, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastFourChars: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  createdBy?: {
    id: string;
    name?: string | null;
    email: string;
  };
}

export interface ApiKeyColumnsOptions {
  onRevoke?: (apiKey: ApiKey) => void;
  onCopyKey?: (apiKey: ApiKey) => void;
  showActions?: boolean;
}

const statusConfig: Record<
  ApiKey["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  EXPIRED: { label: "Expired", variant: "secondary" },
  REVOKED: { label: "Revoked", variant: "destructive" },
};

export function getApiKeyColumns(options: ApiKeyColumnsOptions = {}): ColumnDef<ApiKey>[] {
  const { onRevoke, onCopyKey, showActions = true } = options;

  const columns: ColumnDef<ApiKey>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium">{row.original.name}</div>
      ),
    },
    {
      id: "key",
      header: "Key",
      cell: ({ row }) => (
        <div className="font-mono text-sm text-muted-foreground">
          {row.original.keyPrefix}...{row.original.lastFourChars}
        </div>
      ),
    },
    {
      accessorKey: "scopes",
      header: "Scopes",
      cell: ({ row }) => {
        const scopes = row.original.scopes;
        if (!scopes?.length) {
          return <span className="text-muted-foreground">No scopes</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {scopes.slice(0, 2).map((scope) => (
              <Badge key={scope} variant="outline" className="text-xs">
                {scope}
              </Badge>
            ))}
            {scopes.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{scopes.length - 2}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const config = statusConfig[status];
        return <Badge variant={config.variant}>{config.label}</Badge>;
      },
    },
    {
      accessorKey: "lastUsedAt",
      header: "Last Used",
      cell: ({ row }) => {
        const lastUsed = row.original.lastUsedAt;
        if (!lastUsed) {
          return <span className="text-muted-foreground">Never</span>;
        }
        return (
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(lastUsed), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      accessorKey: "expiresAt",
      header: "Expires",
      cell: ({ row }) => {
        const expiresAt = row.original.expiresAt;
        if (!expiresAt) {
          return <span className="text-muted-foreground">Never</span>;
        }
        const isExpired = new Date(expiresAt) < new Date();
        return (
          <span className={isExpired ? "text-destructive" : "text-muted-foreground"}>
            {formatDistanceToNow(new Date(expiresAt), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
        </span>
      ),
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const apiKey = row.original;
        const isActive = apiKey.status === "ACTIVE";

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopyKey && (
                <DropdownMenuItem onClick={() => onCopyKey(apiKey)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Key ID
                </DropdownMenuItem>
              )}
              {onRevoke && isActive && (
                <DropdownMenuItem
                  onClick={() => onRevoke(apiKey)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Revoke Key
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
