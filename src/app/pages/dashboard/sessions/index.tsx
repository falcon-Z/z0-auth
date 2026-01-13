import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2, MoreHorizontal, Monitor, Smartphone, Tablet, AlertCircle, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { DataTable, DataTableColumnHeader } from "@z0/app/components/data-table/data-table";
import { EmptyState } from "@z0/app/components/shared/empty-state";
import { TableLoadingSkeleton } from "@z0/app/components/shared/loading-skeleton";
import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@z0/components/ui/alert-dialog";

interface Session {
  id: string;
  userAgent: string;
  ipAddress: string;
  deviceInfo?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  status: string;
  isCurrent: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/v1/users/sessions", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }

      const result = await response.json();
      setSessions(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeSession = async (session: Session) => {
    if (session.isCurrent) {
      setError("Cannot revoke current session. Please use logout instead.");
      return;
    }

    setSessionToRevoke(session);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeSession = async () => {
    if (!sessionToRevoke) return;

    try {
      setIsRevoking(true);
      const response = await fetch(
        `/api/v1/users/sessions/${sessionToRevoke.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to revoke session");
      }

      await loadSessions();
      setRevokeDialogOpen(false);
      setSessionToRevoke(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsRevoking(false);
    }
  };

  const handleRevokeAllOther = () => {
    setRevokeAllDialogOpen(true);
  };

  const confirmRevokeAllOther = async () => {
    try {
      setIsRevoking(true);
      const response = await fetch("/api/v1/users/sessions", {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke sessions");
      }

      await loadSessions();
      setRevokeAllDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsRevoking(false);
    }
  };

  const getDeviceIcon = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      return <Smartphone className="h-4 w-4 text-muted-foreground" />;
    }
    if (ua.includes("tablet") || ua.includes("ipad")) {
      return <Tablet className="h-4 w-4 text-muted-foreground" />;
    }
    return <Monitor className="h-4 w-4 text-muted-foreground" />;
  };

  const parseDeviceInfo = (userAgent: string): string => {
    const ua = userAgent;

    let browser = "Unknown";
    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    let os = "Unknown";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    return `${browser} on ${os}`;
  };

  const columns: ColumnDef<Session>[] = [
    {
      id: "device",
      header: "Device",
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex items-center gap-3">
            {getDeviceIcon(session.userAgent)}
            <div>
              <div className="font-medium flex items-center gap-2">
                {parseDeviceInfo(session.userAgent)}
                {session.isCurrent && (
                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    Current
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {session.ipAddress}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "lastUsedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Active" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("lastUsedAt"));
        return (
          <div className="text-sm">
            {formatDistanceToNow(date, { addSuffix: true })}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Signed In" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <div className="text-sm text-muted-foreground">
            {formatDistanceToNow(date, { addSuffix: true })}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const session = row.original;
        const expiresAt = new Date(session.expiresAt);
        const isExpiringSoon = expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;

        return (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                session.status === "ACTIVE"
                  ? "bg-green-50 text-green-700 ring-green-600/20"
                  : "bg-gray-50 text-gray-700 ring-gray-600/20"
              }`}
            >
              {session.status}
            </span>
            {isExpiringSoon && !session.isCurrent && (
              <span className="text-xs text-amber-600">Expires soon</span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const session = row.original;

        if (session.isCurrent) {
          return (
            <div className="text-sm text-muted-foreground italic">
              Use logout to end
            </div>
          );
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handleRevokeSession(session)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <TableLoadingSkeleton />
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === "ACTIVE");
  const otherSessions = activeSessions.filter((s) => !s.isCurrent);

  return (
    <div className="container mx-auto py-6 space-y-6 animate-page-enter">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-1">
          Manage your active sessions across all devices
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-base">Security Tip</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>
            If you see a session you don't recognize, revoke it immediately and
            change your password. You can also revoke all other sessions to sign
            out from all devices except this one.
          </CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Active Sessions ({activeSessions.length})</CardTitle>
              <CardDescription>
                Sessions that are currently signed in
              </CardDescription>
            </div>
            {otherSessions.length > 0 && (
              <Button
                variant="outline"
                onClick={handleRevokeAllOther}
                disabled={isRevoking}
                className="w-full sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke All Other Sessions
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <EmptyState
              icon={Monitor}
              title="No active sessions"
              description="You don't have any active sessions."
            />
          ) : (
            <DataTable columns={columns} data={activeSessions} />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign you out from this device. You'll need to sign in
              again to access your account from that device.
              {sessionToRevoke && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <div className="font-medium">
                    {parseDeviceInfo(sessionToRevoke.userAgent)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sessionToRevoke.ipAddress}
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevokeSession}
              disabled={isRevoking}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRevoking ? "Revoking..." : "Revoke Session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={revokeAllDialogOpen}
        onOpenChange={setRevokeAllDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Other Sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign you out from all devices except this one. You'll
              remain signed in on this device, but you'll need to sign in again
              on all other devices.
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="font-medium text-sm">
                  {otherSessions.length} session(s) will be revoked
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevokeAllOther}
              disabled={isRevoking}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRevoking ? "Revoking..." : "Revoke All Other Sessions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
