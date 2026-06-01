import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { TenantSummary } from "@z0/contracts/tenants";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchTenants } from "../../../lib/tenants-api";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { session, switchOrganization, switching } = useSession();
  const { canReadMembers } = useTenantPermissions();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isActive = tenantId === session.tenant?.id;

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const tenants = await fetchTenants();
      const match = tenants.find((t) => t.id === tenantId);
      if (!match) {
        setError("Tenant not found or you are not a member.");
        setTenant(null);
      } else {
        setTenant(match);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tenant.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSwitch() {
    if (!tenantId || isActive) return;
    setActionError(null);
    try {
      await switchOrganization(tenantId);
      navigate(`/tenants/${tenantId}`, { replace: true });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not switch tenant.");
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !tenant) {
    return (
      <div className="space-y-6">
        <DetailPageHeader backTo="/tenants" backLabel="Tenants" title="Tenant" />
        <PageError title="Not found" message={error ?? "Tenant not found."} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DetailPageHeader
        backTo="/tenants"
        backLabel="Tenants"
        title={tenant.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isActive ? (
              <Button type="button" disabled={switching} onClick={() => void handleSwitch()}>
                {switching ? "Switching…" : "Switch to this tenant"}
              </Button>
            ) : (
              <Badge variant="secondary" className="h-9 px-3">
                Active tenant
              </Badge>
            )}
            {canReadMembers && isActive ? (
              <Button variant="outline" asChild>
                <Link to="/members">Members</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {actionError ? <PageError message={actionError} /> : null}

      <dl className="grid max-w-lg gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Slug</dt>
          <dd>{tenant.slug}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex flex-wrap gap-1">
            {isActive ? <Badge variant="secondary">Active</Badge> : null}
            {tenant.isDefault ? <Badge variant="outline">Default</Badge> : null}
          </dd>
        </div>
      </dl>

      {isActive ? (
        <Button variant="outline" asChild>
          <Link to="/">Open dashboard</Link>
        </Button>
      ) : null}
    </div>
  );
}
