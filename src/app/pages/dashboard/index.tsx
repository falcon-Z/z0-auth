import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router";
import { Building2, Users, AppWindow, Key, Activity, Mail, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@z0/components/ui/card";
import { StatCard } from "@z0/app/components/shared";
import { useAuth } from "../../contexts/auth-context";
import { authFetch } from "@z0/utils/api/client";

interface OrgStats {
  members: {
    total: number;
    active: number;
    pending: number;
  };
  apps: {
    total: number;
    active: number;
    topApps: Array<{
      appId: string;
      name: string;
      userCount: number;
      sessionCount: number;
    }>;
  };
  activity: {
    loginsToday: number;
    sessions30d: number;
    apiKeyCount: number;
  };
  configuration: {
    customRoles: number;
  };
}

export default function Dashboard() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user } = useAuth();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  const currentOrg = useMemo(() => {
    const orgs = user?.organizations || [];
    return orgSlug ? orgs.find((o) => o.slug === orgSlug) : null;
  }, [user, orgSlug]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!currentOrg?.id) {
        setLoading(false);
        return;
      }

      try {
        const response = await authFetch(`/api/v1/orgs/${currentOrg.id}/stats`);
        const result = await response.json();
        if (result.success) {
          setStats(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch organization stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentOrg?.id]);

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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Members"
          value={stats?.members.total ?? 0}
          icon={<Users className="h-4 w-4" />}
          description={`${stats?.members.active ?? 0} active members`}
          loading={loading}
        />

        <StatCard
          title="Applications"
          value={stats?.apps.total ?? 0}
          icon={<AppWindow className="h-4 w-4" />}
          description={`${stats?.apps.active ?? 0} active apps`}
          loading={loading}
        />

        <StatCard
          title="Active API Keys"
          value={stats?.activity.apiKeyCount ?? 0}
          icon={<Key className="h-4 w-4" />}
          description="Currently active"
          loading={loading}
        />

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

      {/* Additional Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
        <StatCard
          title="Logins Today"
          value={stats?.activity.loginsToday ?? 0}
          icon={<Activity className="h-4 w-4" />}
          description="Successful logins today"
          loading={loading}
        />

        <StatCard
          title="Pending Invitations"
          value={stats?.members.pending ?? 0}
          icon={<Mail className="h-4 w-4" />}
          description="Awaiting acceptance"
          loading={loading}
        />

        <StatCard
          title="Custom Roles"
          value={stats?.configuration.customRoles ?? 0}
          icon={<Shield className="h-4 w-4" />}
          description="Organization-defined roles"
          loading={loading}
        />
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
