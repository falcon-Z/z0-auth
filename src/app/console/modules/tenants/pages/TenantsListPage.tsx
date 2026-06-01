import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { isTenantOnlyConsoleUser, tenantMembershipCount } from "../../../lib/console-access";

import type { TenantSummary } from "@z0/contracts/tenants";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { RowActionLink } from "../../../components/crud/RowActionLink";
import { ApiError } from "../../../lib/api";
import { fetchTenants } from "../../../lib/tenants-api";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";

export function TenantsListPage() {
  const navigate = useNavigate();
  const { session, switchOrganization, switching } = useSession();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canCreate = sessionHasPermission(session, "tenants:create");
  const activeId = session.tenant?.id;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenants(await fetchTenants());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (isTenantOnlyConsoleUser(session) && tenantMembershipCount(session) === 1 && session.tenant) {
      navigate("/", { replace: true });
    }
  }, [navigate, session]);

  async function handleSwitch(tenant: TenantSummary) {
    if (tenant.id === activeId) {
      navigate(`/tenants/${tenant.id}`);
      return;
    }
    setBusyId(tenant.id);
    setActionError(null);
    try {
      await switchOrganization(tenant.id);
      navigate(`/tenants/${tenant.id}`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not switch tenant.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Tenants" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Tenants"
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/tenants/new">Create tenant</Link>
            </Button>
          ) : undefined
        }
      />

      {actionError ? <PageError message={actionError} /> : null}

      <DataTable<TenantSummary>
        columns={[
          {
            id: "name",
            header: "Name",
            cell: (row) => (
              <div className="flex flex-col gap-1">
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground text-xs">{row.slug}</span>
              </div>
            ),
          },
          {
            id: "status",
            header: "Status",
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.id === activeId ? (
                  <Badge variant="secondary">Active</Badge>
                ) : null}
                {row.isDefault ? <Badge variant="outline">Default</Badge> : null}
              </div>
            ),
          },
        ]}
        rows={tenants}
        rowKey={(row) => row.id}
        onRowClick={(tenant) => navigate(`/tenants/${tenant.id}`)}
        emptyMessage={canCreate ? "No tenants yet" : "No tenants"}
        rowActions={(tenant) => (
          <div className="flex flex-wrap justify-end gap-1">
            <RowActionLink to={`/tenants/${tenant.id}`}>View</RowActionLink>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyId === tenant.id || switching}
              onClick={() => void handleSwitch(tenant)}
            >
              {tenant.id === activeId ? "Open" : busyId === tenant.id ? "Switching…" : "Switch"}
            </Button>
          </div>
        )}
      />

      {canCreate && tenants.length === 0 ? (
        <Button asChild variant="outline">
          <Link to="/tenants/new">Create tenant</Link>
        </Button>
      ) : null}
    </div>
  );
}
