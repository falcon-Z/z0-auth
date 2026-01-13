/**
 * Session table column definitions
 * Reusable columns for user sessions DataTable
 */

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Monitor, Smartphone, Tablet, HelpCircle } from "lucide-react";
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
import { Badge } from "@z0/components/ui/badge";

/**
 * Session type from API response
 */
export interface Session {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
  status: "ACTIVE" | "IDLE" | "EXPIRED" | "REVOKED";
  isCurrent: boolean;
}

interface SessionColumnsOptions {
  onRevoke?: (session: Session) => void;
  showActions?: boolean;
}

/**
 * Parse user agent to get device type
 */
function getDeviceType(userAgent?: string | null): "desktop" | "mobile" | "tablet" | "unknown" {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  }
  if (ua.includes("tablet") || ua.includes("ipad")) {
    return "tablet";
  }
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) {
    return "desktop";
  }
  return "unknown";
}

/**
 * Get device icon component
 */
function DeviceIcon({ userAgent }: { userAgent?: string | null }) {
  const type = getDeviceType(userAgent);
  switch (type) {
    case "desktop":
      return <Monitor className="h-4 w-4" />;
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Tablet className="h-4 w-4" />;
    default:
      return <HelpCircle className="h-4 w-4" />;
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getSessionColumns({
  onRevoke,
  showActions = true,
}: SessionColumnsOptions = {}): ColumnDef<Session>[] {
  const columns: ColumnDef<Session>[] = [
    {
      accessorKey: "deviceInfo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Device" />
      ),
      cell: ({ row }) => {
        const session = row.original;
        const deviceInfo = session.deviceInfo || session.userAgent || "Unknown device";
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <DeviceIcon userAgent={session.userAgent} />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                {deviceInfo.length > 40 ? deviceInfo.slice(0, 40) + "..." : deviceInfo}
                {session.isCurrent && (
                  <Badge variant="default" className="text-xs">
                    Current
                  </Badge>
                )}
              </div>
              {session.ipAddress && (
                <div className="text-sm text-muted-foreground">
                  {session.ipAddress}
                </div>
              )}
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
      cell: ({ row }) => {
        const status = row.getValue("status") as Session["status"];
        const variant = status === "ACTIVE" ? "default" : status === "IDLE" ? "secondary" : "outline";
        return <Badge variant={variant}>{status}</Badge>;
      },
    },
    {
      accessorKey: "lastUsedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Active" />
      ),
      cell: ({ row }) => {
        const lastUsed = row.getValue("lastUsedAt") as string | null;
        if (!lastUsed) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-muted-foreground">
            {formatRelativeTime(lastUsed)}
          </span>
        );
      },
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
    {
      accessorKey: "expiresAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Expires" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("expiresAt"));
        const isExpired = date < new Date();
        return (
          <span className={isExpired ? "text-destructive" : "text-muted-foreground"}>
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
        const session = row.original;

        if (session.isCurrent) {
          return (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Active session
            </Badge>
          );
        }

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
              {onRevoke && (
                <DropdownMenuItem
                  onClick={() => onRevoke(session)}
                  className="text-destructive focus:text-destructive"
                >
                  Revoke session
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

export type { SessionColumnsOptions };
