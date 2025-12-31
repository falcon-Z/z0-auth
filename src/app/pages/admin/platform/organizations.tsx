/**
 * Platform Organizations Page
 * Admin view for managing all organizations on the platform
 */

import { useNavigate } from "react-router";
import { Building2, Search } from "lucide-react";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { PageHeader } from "@z0/app/components/shared";
import {
  OrganizationTable,
  CreateOrganizationDialog,
} from "@z0/app/components/organizations";
import { useCrudPage } from "@z0/app/hooks";
import { authFetch } from "@z0/utils/api/client";
import type { OrganizationWithCounts, CreateOrganizationInput } from "@z0/types";

// API functions
async function fetchOrganizations(): Promise<OrganizationWithCounts[]> {
  const response = await authFetch("/api/v1/platform/organizations");
  if (!response.ok) {
    throw new Error("Failed to load organizations");
  }
  const result = await response.json();
  return result.data || [];
}

async function createOrganization(data: CreateOrganizationInput): Promise<OrganizationWithCounts> {
  const response = await authFetch("/api/v1/platform/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to create organization");
  }
  const result = await response.json();
  return result.data;
}

export default function PlatformOrganizations() {
  const navigate = useNavigate();

  const {
    items: organizations,
    filteredItems,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    isDialogOpen,
    openCreateDialog,
    closeDialog,
    isSubmitting,
    handleCreate,
  } = useCrudPage<OrganizationWithCounts, CreateOrganizationInput>({
    fetchItems: fetchOrganizations,
    createItem: createOrganization,
    onCreateSuccess: (org) => {
      navigate(`/admin/organizations/${org.id}`);
    },
  });

  const handleView = (org: OrganizationWithCounts) => {
    navigate(`/admin/organizations/${org.id}`);
  };

  const handleSubmitCreate = async (data: CreateOrganizationInput) => {
    await handleCreate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Manage all organizations on the platform"
        showCreate
        createLabel="Create Organization"
        onCreate={openCreateDialog}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Organizations</CardTitle>
              <CardDescription>
                {organizations.length} organization{organizations.length !== 1 ? "s" : ""} on the platform
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <OrganizationTable
            data={filteredItems}
            loading={isLoading}
            onView={handleView}
            showActions={false}
            emptyMessage={
              searchQuery
                ? "No organizations match your search"
                : "No organizations found. Create one to get started."
            }
          />
        </CardContent>
      </Card>

      <CreateOrganizationDialog
        open={isDialogOpen("create")}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={handleSubmitCreate}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
