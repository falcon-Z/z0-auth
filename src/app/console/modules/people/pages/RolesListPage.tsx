import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { InstanceRoleSummary } from "@z0/contracts/rbac";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { TeamWorkspaceLayout } from "../../../components/team/TeamWorkspaceLayout";
import { usePermissions } from "../../../hooks/use-permissions";
import { fetchRoles } from "../../../lib/rbac-api";
import { CreateRoleDialog } from "../components/CreateRoleDialog";

export function RolesListPage() {
  const navigate = useNavigate();
  const { hasScope } = usePermissions();
  const canManage = hasScope("roles:manage");

  const [roles, setRoles] = useState<InstanceRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRoles(await fetchRoles());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <TeamWorkspaceLayout title="Team">
        <PageError message={error} onRetry={() => void load()} />
      </TeamWorkspaceLayout>
    );
  }

  return (
    <TeamWorkspaceLayout
      title="Team"
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>Create role</Button>
        ) : undefined
      }
    >
      <DataTable<InstanceRoleSummary>
        columns={[
          {
            id: "name",
            header: "Role",
            accessorFn: (row) => row.name,
            cell: (row) => (
              <div className="space-y-1">
                <span className="font-medium">{row.name}</span>
                {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
              </div>
            ),
          },
          {
            id: "type",
            header: "Type",
            accessorFn: (row) => (row.isSystem ? "System" : "Custom"),
            cell: (row) => (
              <Badge variant={row.isSystem ? "secondary" : "outline"}>{row.isSystem ? "System" : "Custom"}</Badge>
            ),
          },
          {
            id: "members",
            header: "Members",
            accessorFn: (row) => row.memberCount,
            cell: (row) => row.memberCount,
          },
          {
            id: "scopes",
            header: "Permissions",
            accessorFn: (row) => row.scopeCount,
            cell: (row) => `${row.scopeCount} permissions`,
          },
        ]}
        rows={roles}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/team/roles/${row.id}`)}
        emptyMessage="No roles yet"
        emptyAction={
          canManage ? <EmptyStateButton onClick={() => setCreateOpen(true)}>Create role</EmptyStateButton> : undefined
        }
      />

      <p className="text-sm text-muted-foreground">
        System roles cover common team needs.{" "}
        <Button variant="link" className="h-auto p-0" asChild>
          <Link to="/team">Back to people</Link>
        </Button>
      </p>

      {canManage ? (
        <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
      ) : null}
    </TeamWorkspaceLayout>
  );
}
