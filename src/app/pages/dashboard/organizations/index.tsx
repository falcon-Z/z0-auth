/**
 * Dashboard Organizations Page
 * User view for their organizations (from auth context)
 */

import { useNavigate } from "react-router";
import { Building2, Search, ChevronRight } from "lucide-react";
import { Input } from "@z0/components/ui/input";
import { PageHeader, EmptyState } from "@z0/app/components/shared";
import { useAuth } from "@z0/app/contexts/auth-context";
import { useState, useMemo } from "react";
import { Badge } from "@z0/components/ui/badge";
import { Card, CardContent } from "@z0/components/ui/card";
import { Skeleton } from "@z0/components/ui/skeleton";
import { ORG_ROLE_LABELS } from "@z0/types";
import type { UserOrganization } from "@z0/types";

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const organizations = user?.organizations || [];

  const filteredOrganizations = useMemo(() => {
    if (!searchQuery) return organizations;

    const query = searchQuery.toLowerCase();
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query)
    );
  }, [organizations, searchQuery]);

  const handleRowClick = (org: UserOrganization) => {
    navigate(`/dashboard/organizations/${org.slug}`);
  };

  const handleCreateOrganization = () => {
    navigate("/dashboard/organizations/new");
  };

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHeader
        title="My Organizations"
        description="Organizations you are a member of"
        showCreate
        createLabel="New Organization"
        onCreate={handleCreateOrganization}
      />

      {/* Search - only show if there are multiple orgs */}
      {organizations.length > 3 && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Organizations Grid */}
      {!isLoading && filteredOrganizations.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredOrganizations.map((org) => (
            <Card
              key={org.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => handleRowClick(org)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {org.name}
                        {org.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {org.slug}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Badge variant="outline">
                    {ORG_ROLE_LABELS[org.roleType] || org.roleType}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredOrganizations.length === 0 && (
        <EmptyState
          icon={Building2}
          title={searchQuery ? "No organizations found" : "No organizations yet"}
          description={
            searchQuery
              ? "No organizations match your search criteria"
              : "You are not a member of any organizations yet"
          }
          action={
            !searchQuery
              ? {
                  label: "Create Organization",
                  onClick: handleCreateOrganization,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
