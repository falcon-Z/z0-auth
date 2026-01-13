import { useNavigate } from "react-router";
import {
  Building2,
  Users,
  Shield,
  Zap,
  ArrowRight,
  Mail,
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

export default function AdminDashboard() {
  const navigate = useNavigate();

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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Orgs</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Total organizations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Total administrators</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Across all orgs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Apps</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Registered applications</p>
          </CardContent>
        </Card>
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
