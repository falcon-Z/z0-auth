import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  Shield,
  Zap,
  ArrowRight,
  Mail,
  Activity,
  TrendingUp,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@z0/components/ui/tabs";
import { StatCard } from "@z0/app/components/shared";
import { authFetch } from "@z0/utils/api/client";

interface PlatformStats {
  overview: {
    totalOrganizations: number;
    activeOrganizations: number;
    totalUsers: number;
    activeUsers: number;
    totalApps: number;
    activeApps: number;
  };
  today: {
    activeSessions: number;
    newUsers: number;
    newOrganizations: number;
  };
  webhooks: {
    deliveries24h: number;
    failed24h: number;
    successRate: number;
  };
  growth: {
    users: number;
    organizations: number;
  };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await authFetch("/api/v1/platform/stats");
        const result = await response.json();
        if (result.success) {
          setStats(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch platform stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const adminSections = [
    {
      title: "Platform Organizations",
      description: "Manage all organizations on the platform",
      icon: Building2,
      href: "/admin/platform/organizations",
      stats: "View all orgs",
    },
    {
      title: "Platform Users",
      description: "Manage platform administrators and managers",
      icon: Users,
      href: "/admin/platform/users",
      stats: "Manage admins",
    },
    {
      title: "Security & Compliance",
      description: "Monitor security events and audit logs",
      icon: Shield,
      href: "/admin/security",
      stats: "View logs",
    },
    {
      title: "SMTP Configuration",
      description: "Configure email server settings for notifications",
      icon: Mail,
      href: "/admin/settings/smtp",
      stats: "Configure",
    },
    {
      title: "System Configuration",
      description: "Configure platform settings and integrations",
      icon: Zap,
      href: "/admin/settings",
      stats: "Configure",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage your Z0 Auth platform, organizations, users, and system settings
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Organizations"
          value={stats?.overview.totalOrganizations ?? 0}
          icon={<Building2 className="h-4 w-4" />}
          description={`${stats?.overview.activeOrganizations ?? 0} active`}
          loading={loading}
        />

        <StatCard
          title="Total Users"
          value={stats?.overview.totalUsers ?? 0}
          icon={<Users className="h-4 w-4" />}
          description={`${stats?.overview.activeUsers ?? 0} active`}
          loading={loading}
        />

        <StatCard
          title="Applications"
          value={stats?.overview.totalApps ?? 0}
          icon={<Zap className="h-4 w-4" />}
          description={`${stats?.overview.activeApps ?? 0} active`}
          loading={loading}
        />

        <StatCard
          title="Sessions Today"
          value={stats?.today.activeSessions ?? 0}
          icon={<Activity className="h-4 w-4" />}
          description="Active user sessions"
          loading={loading}
        />
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="New Users Today"
          value={stats?.today.newUsers ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Registered today"
          loading={loading}
        />

        <StatCard
          title="New Orgs Today"
          value={stats?.today.newOrganizations ?? 0}
          icon={<Building2 className="h-4 w-4" />}
          description="Created today"
          loading={loading}
        />

        <StatCard
          title="Webhook Success Rate"
          value={
            stats
              ? `${Math.round(stats.webhooks.successRate)}%`
              : "0%"
          }
          icon={<Shield className="h-4 w-4" />}
          description={`${stats?.webhooks.deliveries24h ?? 0} deliveries (24h)`}
          loading={loading}
        />
      </div>

      {/* Admin Sections */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {adminSections.map((section) => {
          const IconComponent = section.icon;
          return (
            <Card
              key={section.href}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(section.href)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <IconComponent className="h-5 w-5" />
                      {section.title}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {section.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(section.href);
                  }}
                >
                  {section.stats}
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Additional Admin Info */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Overview</CardTitle>
          <CardDescription>
            Key metrics and information about your Z0 Auth deployment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="system">System Health</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Version</p>
                  <p className="text-lg font-semibold">1.0.0</p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Deployment</p>
                  <p className="text-lg font-semibold">Production</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="system" className="space-y-4 mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>System health monitoring coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
