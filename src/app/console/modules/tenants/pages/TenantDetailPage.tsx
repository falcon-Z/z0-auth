import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { TenantSummary } from "@z0/contracts/tenants";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchTenants } from "../../../lib/tenants-api";
import { isSessionMemberOfTenant } from "../../../lib/tenant-membership";
import { useSession } from "../../../context/session-context";

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { session, switchOrganization, switching, switchError } = useSession();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const isMember = tenantId ? isSessionMemberOfTenant(session, tenantId) : false;
  const isActive = tenantId === session.tenant?.id;

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const tenants = await fetchTenants();
      const match = tenants.find((t) => t.id === tenantId);
      if (!match) {
        setError("Tenant not found or you cannot view it.");
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

  useEffect(() => {
    if (loading || !tenant || !tenantId || !isMember) return;

    if (isActive) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;
    setOpening(true);
    void switchOrganization(tenantId).then((ok) => {
      if (cancelled) return;
      if (ok) {
        navigate("/", { replace: true });
      } else {
        setOpening(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loading, tenant, tenantId, isMember, isActive, navigate, switchOrganization]);

  if (loading || opening || switching) {
    return <ListPageSkeleton />;
  }

  if (error || !tenant) {
    return (
      <EntityDetailLayout backTo="/tenants" backLabel="Tenants" name="Tenant" tabs={[]}>
        <PageError title="Not found" message={error ?? "Tenant not found."} onRetry={() => void reload()} />
      </EntityDetailLayout>
    );
  }

  if (isMember) {
    if (switchError) {
      return (
        <EntityDetailLayout backTo="/tenants" backLabel="Tenants" name={tenant.name} subtitle={tenant.slug}>
          <PageError message={switchError} onRetry={() => void reload()} />
        </EntityDetailLayout>
      );
    }
    return <ListPageSkeleton />;
  }

  return (
    <EntityDetailLayout
      backTo="/tenants"
      backLabel="Tenants"
      name={tenant.name}
      subtitle={tenant.slug}
      badges={
        <>
          {tenant.isDefault ? <Badge variant="outline">Default</Badge> : null}
          <Badge variant="outline">View only</Badge>
        </>
      }
    >
      {switchError ? <PageError message={switchError} /> : null}

      <p className="text-sm text-muted-foreground">You are not a member of this tenant.</p>

      <dl className="mt-6 grid max-w-lg gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Slug</dt>
          <dd>{tenant.slug}</dd>
        </div>
      </dl>

      <div className="pt-4">
        <Button type="button" variant="outline" onClick={() => navigate("/tenants")}>
          Back to directory
        </Button>
      </div>
    </EntityDetailLayout>
  );
}
