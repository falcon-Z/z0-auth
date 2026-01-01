/**
 * Webhook column definitions for DataTable
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
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  PauseCircle,
  Send,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  status: "ACTIVE" | "PAUSED" | "FAILED";
  lastTriggeredAt?: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookColumnsOptions {
  onEdit?: (webhook: Webhook) => void;
  onDelete?: (webhook: Webhook) => void;
  onToggleStatus?: (webhook: Webhook) => void;
  onTest?: (webhook: Webhook) => void;
  showActions?: boolean;
}

const statusConfig: Record<
  Webhook["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  PAUSED: { label: "Paused", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export function getWebhookColumns(options: WebhookColumnsOptions = {}): ColumnDef<Webhook>[] {
  const { onEdit, onDelete, onToggleStatus, onTest, showActions = true } = options;

  const columns: ColumnDef<Webhook>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium">{row.original.name}</div>
      ),
    },
    {
      accessorKey: "url",
      header: "Endpoint",
      cell: ({ row }) => {
        const url = row.original.url;
        // Truncate long URLs
        const displayUrl = url.length > 40 ? `${url.substring(0, 40)}...` : url;
        return (
          <div className="flex items-center gap-1 text-muted-foreground">
            <code className="text-xs">{displayUrl}</code>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        );
      },
    },
    {
      accessorKey: "events",
      header: "Events",
      cell: ({ row }) => {
        const events = row.original.events;
        if (!events?.length) {
          return <span className="text-muted-foreground">No events</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {events.slice(0, 2).map((event) => (
              <Badge key={event} variant="outline" className="text-xs">
                {event}
              </Badge>
            ))}
            {events.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{events.length - 2}
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
        const failureCount = row.original.failureCount;
        return (
          <div className="flex items-center gap-2">
            <Badge variant={config.variant}>{config.label}</Badge>
            {status === "FAILED" && failureCount > 0 && (
              <span className="text-xs text-destructive">
                ({failureCount} failures)
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "lastTriggeredAt",
      header: "Last Triggered",
      cell: ({ row }) => {
        const lastTriggered = row.original.lastTriggeredAt;
        if (!lastTriggered) {
          return <span className="text-muted-foreground">Never</span>;
        }
        return (
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(lastTriggered), { addSuffix: true })}
          </span>
        );
      },
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const webhook = row.original;
        const isActive = webhook.status === "ACTIVE";
        const isPaused = webhook.status === "PAUSED";

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onTest && isActive && (
                <DropdownMenuItem onClick={() => onTest(webhook)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send Test
                </DropdownMenuItem>
              )}
              {onToggleStatus && (isActive || isPaused) && (
                <DropdownMenuItem onClick={() => onToggleStatus(webhook)}>
                  {isActive ? (
                    <>
                      <PauseCircle className="mr-2 h-4 w-4" />
                      Pause Webhook
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Resume Webhook
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(webhook)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Webhook
                </DropdownMenuItem>
              )}
              {(onTest || onToggleStatus || onEdit) && onDelete && (
                <DropdownMenuSeparator />
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(webhook)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Webhook
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
