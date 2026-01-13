import { useMemo } from "react";
import { useParams } from "react-router";
import { Building2, Users, AppWindow, Key } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@z0/components/ui/card";
import { useAuth } from "../../contexts/auth-context";

export default function Dashboard() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user } = useAuth();

  const currentOrg = useMemo(() => {
    const orgs = user?.organizations || [];
    return orgSlug ? orgs.find((o) => o.slug === orgSlug) : null;
  }, [user, orgSlug]);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        {currentOrg && (
          <p className="text-muted-foreground mt-1">
            Welcome to {currentOrg.name}
          </p>
        )}
      </div>

      {/* Placeholder Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Active members in organization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <AppWindow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Registered applications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Active API keys
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organization</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {currentOrg?.name || "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Current organization
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for future widgets */}
      <div className="mt-8">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">
              Dashboard widgets coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
