import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  Activity,
  RefreshCw,
  Search,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
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

interface RequestTrace {
  id: string;
  requestId: string;
  method: string;
  path: string;
  userId: string | null;
  appId: string | null;
  ipAddress: string | null;
  statusCode: number | null;
  duration: number | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startTime: string;
  userAgent: string | null;
}

interface Stats {
  period: { from: string; to: string };
  totals: { requests: number; successful: number; failed: number; successRate: string };
  duration: { avg: number; min: number; max: number };
  byMethod: Record<string, number>;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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

function getStatusBadge(statusCode: number | null) {
  if (statusCode === null) return <Badge variant="outline">—</Badge>;
  if (statusCode >= 200 && statusCode < 300) {
    return <Badge variant="default">{statusCode}</Badge>;
  } else if (statusCode >= 400 && statusCode < 500) {
    return <Badge variant="secondary">{statusCode}</Badge>;
  } else if (statusCode >= 500) {
    return <Badge variant="destructive">{statusCode}</Badge>;
  }
  return <Badge variant="outline">{statusCode}</Badge>;
}

function getMethodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-green-600";
    case "POST":
      return "text-blue-600";
    case "PUT":
    case "PATCH":
      return "text-yellow-600";
    case "DELETE":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

export default function RequestTracesPage() {
  const [traces, setTraces] = useState<RequestTrace[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<RequestTrace | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchPath, setSearchPath] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadTraces = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      if (searchPath) params.set("path", searchPath);
      if (methodFilter && methodFilter !== "all") params.set("method", methodFilter);
      if (statusFilter === "success") params.set("success", "true");
      if (statusFilter === "error") params.set("success", "false");

      const response = await fetch(`/api/v1/admin/request-traces?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load request traces");
      }

      const result = await response.json();
      setTraces(result.data || []);
      if (result.pagination) {
        setTotalPages(result.pagination.totalPages || 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [page, searchPath, methodFilter, statusFilter]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/request-traces/stats", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setStats(result.data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  useEffect(() => {
    loadTraces();
    loadStats();
  }, [loadTraces, loadStats]);

  const handleExport = async () => {
    try {
      const response = await fetch("/api/v1/admin/request-traces/export?format=json", {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Export failed");

      const result = await response.json();
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `request-traces-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadTraces();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Request Traces</h1>
          <p className="text-muted-foreground mt-1">
            Monitor API requests and performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadTraces(); loadStats(); }} disabled={isLoading}>
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
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.requests.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                {stats.totals.successRate}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                {stats.totals.failed.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Response Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                {formatDuration(stats.duration.avg)}
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
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by path..."
                value={searchPath}
                onChange={(e) => setSearchPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Traces Table */}
      <Card>
        <CardHeader>
          <CardTitle>Request Log</CardTitle>
          <CardDescription>Click on a row to view details</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : traces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No request traces found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traces.map((trace) => (
                    <TableRow
                      key={trace.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedTrace(trace)}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(trace.startTime)}
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-medium ${getMethodColor(trace.method)}`}>
                          {trace.method}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-xs truncate">
                        {trace.path}
                      </TableCell>
                      <TableCell>{getStatusBadge(trace.statusCode)}</TableCell>
                      <TableCell className="text-sm">
                        {formatDuration(trace.duration)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {trace.ipAddress || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTrace} onOpenChange={() => setSelectedTrace(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              {selectedTrace?.requestId}
            </DialogDescription>
          </DialogHeader>
          {selectedTrace && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Method</p>
                  <p className={`font-mono font-medium ${getMethodColor(selectedTrace.method)}`}>
                    {selectedTrace.method}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedTrace.statusCode)}
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p>{formatDuration(selectedTrace.duration)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">IP Address</p>
                  <p>{selectedTrace.ipAddress || "—"}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Path</p>
                <code className="text-sm bg-muted p-2 rounded block break-all">
                  {selectedTrace.path}
                </code>
              </div>
              {selectedTrace.userId && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">User ID</p>
                  <code className="text-sm bg-muted p-2 rounded block">
                    {selectedTrace.userId}
                  </code>
                </div>
              )}
              {selectedTrace.errorMessage && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Error</p>
                  <p className="text-sm text-red-600">{selectedTrace.errorMessage}</p>
                </div>
              )}
              {selectedTrace.userAgent && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">User Agent</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {selectedTrace.userAgent}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
