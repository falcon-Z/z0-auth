import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
  Search,
  Download,
  Shield,
  Activity,
  User,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@z0/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { Badge } from "@z0/components/ui/badge";
import { Separator } from "@z0/components/ui/separator";

interface AuditLogEntry {
  id: string;
  action: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  actorId?: string;
  actorType?: "user" | "platform_manager" | "system" | "api";
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  targetEmail?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failure" | "error";
  errorMessage?: string;
  metadata?: Record<string, any>;
  requestId?: string;
  sessionId?: string;
  deviceId?: string;
  location?: string;
  createdAt: string;
}

interface Stats {
  totalLogs: number;
  criticalEvents: number;
  byAction: Array<{ action: string; _count: { action: number } }>;
  bySeverity: Array<{ severity: string; _count: { severity: number } }>;
  byStatus: Array<{ status: string; _count: { status: number } }>;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return <Badge variant="destructive" className="bg-red-600">CRITICAL</Badge>;
    case "HIGH":
      return <Badge variant="destructive">HIGH</Badge>;
    case "MEDIUM":
      return <Badge variant="secondary" className="bg-yellow-600 text-white">MEDIUM</Badge>;
    case "LOW":
      return <Badge variant="outline">LOW</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return <Badge variant="default" className="bg-green-600">Success</Badge>;
    case "failure":
      return <Badge variant="secondary">Failure</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getActorTypeBadge(actorType: string | undefined) {
  if (!actorType) return null;

  switch (actorType) {
    case "user":
      return <Badge variant="outline"><User className="h-3 w-3 mr-1" />User</Badge>;
    case "platform_manager":
      return <Badge variant="default"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
    case "system":
      return <Badge variant="secondary"><Activity className="h-3 w-3 mr-1" />System</Badge>;
    case "api":
      return <Badge variant="outline">API</Badge>;
    default:
      return <Badge variant="outline">{actorType}</Badge>;
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // Filters
  const [searchAction, setSearchAction] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actorTypeFilter, setActorTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      if (searchAction) params.set("action", searchAction);
      if (severityFilter && severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (actorTypeFilter && actorTypeFilter !== "all") params.set("actorType", actorTypeFilter);

      const response = await fetch(`/api/admin/audit-logs?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load audit logs");
      }

      const result = await response.json();
      setLogs(result.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [searchAction, severityFilter, statusFilter, actorTypeFilter, limit]);

  const loadStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const response = await fetch("/api/admin/audit-logs/statistics", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setStats(result.statistics);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [loadLogs, loadStats]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (searchAction) params.set("action", searchAction);
      if (severityFilter && severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(`/api/admin/audit-logs?${params}&limit=1000`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Export failed");

      const result = await response.json();
      const blob = new Blob([JSON.stringify(result.logs || [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleSearch = () => {
    loadLogs();
  };

  const handleReset = () => {
    setSearchAction("");
    setSeverityFilter("all");
    setStatusFilter("all");
    setActorTypeFilter("all");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileText className="h-8 w-8" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor security events and system activities
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadLogs(); loadStats(); }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {!isLoadingStats && stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLogs.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Critical Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                {stats.criticalEvents.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(() => {
                  const successCount = stats.byStatus.find(s => s.status === 'success')?._count.status || 0;
                  return stats.totalLogs > 0
                    ? `${((successCount / stats.totalLogs) * 100).toFixed(1)}%`
                    : "0%";
                })()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                {(() => {
                  const failureCount = stats.byStatus.find(s => s.status === 'failure')?._count.status || 0;
                  const errorCount = stats.byStatus.find(s => s.status === 'error')?._count.status || 0;
                  return (failureCount + errorCount).toLocaleString();
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter audit logs by action, severity, status, or actor type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search action..."
                  value={searchAction}
                  onChange={(e) => setSearchAction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Actor Type</label>
              <Select value={actorTypeFilter} onValueChange={setActorTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All actors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="platform_manager">Admin</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="flex gap-2">
              <Button onClick={handleSearch} size="sm">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
              <Button onClick={handleReset} variant="outline" size="sm">
                Reset
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={limit.toString()} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Log Entries</CardTitle>
          <CardDescription>
            Showing {logs.length} recent audit log {logs.length === 1 ? "entry" : "entries"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="font-mono text-xs">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {log.action}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {log.actorEmail && (
                            <span className="text-sm">{log.actorEmail}</span>
                          )}
                          {getActorTypeBadge(log.actorType)}
                        </div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete information about this audit log entry
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Action</h4>
                  <p className="text-sm font-mono">{selectedLog.action}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Timestamp</h4>
                  <p className="text-sm">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Severity</h4>
                  <div className="mt-1">{getSeverityBadge(selectedLog.severity)}</div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Actor Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedLog.actorEmail && (
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm">{selectedLog.actorEmail}</p>
                    </div>
                  )}
                  {selectedLog.actorType && (
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <div className="mt-1">{getActorTypeBadge(selectedLog.actorType)}</div>
                    </div>
                  )}
                  {selectedLog.actorId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Actor ID</p>
                      <p className="text-sm font-mono">{selectedLog.actorId}</p>
                    </div>
                  )}
                </div>
              </div>

              {(selectedLog.targetId || selectedLog.targetEmail || selectedLog.targetType) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Target Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedLog.targetEmail && (
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm">{selectedLog.targetEmail}</p>
                        </div>
                      )}
                      {selectedLog.targetType && (
                        <div>
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="text-sm">{selectedLog.targetType}</p>
                        </div>
                      )}
                      {selectedLog.targetId && (
                        <div>
                          <p className="text-xs text-muted-foreground">Target ID</p>
                          <p className="text-sm font-mono">{selectedLog.targetId}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Request Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedLog.ipAddress && (
                    <div>
                      <p className="text-xs text-muted-foreground">IP Address</p>
                      <p className="text-sm font-mono">{selectedLog.ipAddress}</p>
                    </div>
                  )}
                  {selectedLog.requestId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Request ID</p>
                      <p className="text-sm font-mono">{selectedLog.requestId}</p>
                    </div>
                  )}
                  {selectedLog.sessionId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Session ID</p>
                      <p className="text-sm font-mono">{selectedLog.sessionId}</p>
                    </div>
                  )}
                  {selectedLog.deviceId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Device ID</p>
                      <p className="text-sm font-mono">{selectedLog.deviceId}</p>
                    </div>
                  )}
                  {selectedLog.location && (
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="text-sm">{selectedLog.location}</p>
                    </div>
                  )}
                  {selectedLog.organizationId && (
                    <div>
                      <p className="text-xs text-muted-foreground">Organization ID</p>
                      <p className="text-sm font-mono">{selectedLog.organizationId}</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedLog.userAgent && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">User Agent</h4>
                    <p className="text-xs font-mono mt-1 p-2 bg-muted rounded break-all">
                      {selectedLog.userAgent}
                    </p>
                  </div>
                </>
              )}

              {selectedLog.errorMessage && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-destructive">Error Message</h4>
                    <p className="text-sm mt-1 p-2 bg-destructive/10 rounded">
                      {selectedLog.errorMessage}
                    </p>
                  </div>
                </>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h4>
                    <pre className="text-xs p-3 bg-muted rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
