import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@z0/app/components/data-table/data-table";
import { StatusBadge } from "@z0/app/components/shared/status-badge";
import { EmptyState } from "@z0/app/components/shared/empty-state";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Building2, Plus, Search } from "lucide-react";
import { format } from "date-fns";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  maxUsers: number | null;
  maxApps: number | null;
  userCount: number;
  appCount: number;
  createdAt: string;
  updatedAt: string;
}

const columns: ColumnDef<Organization>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      return (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-sm text-muted-foreground">/{row.original.slug}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {row.original.description || "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const statusMap: Record<string, "active" | "inactive" | "suspended"> = {
        ACTIVE: "active",
        INACTIVE: "inactive",
        SUSPENDED: "suspended",
      };
      return <StatusBadge status={statusMap[row.original.status]} />;
    },
  },
  {
    accessorKey: "userCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
    cell: ({ row }) => {
      const max = row.original.maxUsers;
      return (
        <span className="text-sm">
          {row.original.userCount}
          {max && <span className="text-muted-foreground"> / {max}</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "appCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Apps" />,
    cell: ({ row }) => {
      const max = row.original.maxApps;
      return (
        <span className="text-sm">
          {row.original.appCount}
          {max && <span className="text-muted-foreground"> / {max}</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {format(new Date(row.original.createdAt), "MMM d, yyyy")}
        </span>
      );
    },
  },
];

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrganizations, setFilteredOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = organizations.filter(
        (org) =>
          org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          org.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
          org.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredOrganizations(filtered);
    } else {
      setFilteredOrganizations(organizations);
    }
  }, [searchQuery, organizations]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/orgs", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }

      const data = await response.json();
      setOrganizations(data.organizations || []);
      setFilteredOrganizations(data.organizations || []);
    } catch (err: any) {
      console.error("Error fetching organizations:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (org: Organization) => {
    navigate(`/dashboard/organizations/${org.id}`);
  };

  const handleCreateOrganization = () => {
    navigate("/dashboard/organizations/new");
  };

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">
            Manage all organizations and their settings
          </p>
        </div>
        <Button onClick={handleCreateOrganization} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Organization
        </Button>
      </div>

      {/* Search */}
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

      {/* Table */}
      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredOrganizations}
          onRowClick={handleRowClick}
          loading={loading}
          emptyState={
            <EmptyState
              icon={Building2}
              title="No organizations found"
              description={
                searchQuery
                  ? "No organizations match your search criteria"
                  : "Get started by creating your first organization"
              }
              action={
                searchQuery
                  ? undefined
                  : {
                      label: "Create Organization",
                      onClick: handleCreateOrganization,
                    }
              }
            />
          }
        />
      )}
    </div>
  );
}
