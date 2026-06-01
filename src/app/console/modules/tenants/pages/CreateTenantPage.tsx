import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { CreateInviteResponse } from "@z0/contracts/invites";
import type { TenantSummary } from "@z0/contracts/tenants";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { createTenantInvite, fetchTenantRoles } from "../../../lib/members-api";
import { createTenant, slugifyTenantName } from "../../../lib/tenants-api";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";
import { InviteFormDialog } from "../../members/components/InviteFormDialog";
import { InviteResultDialog } from "../../members/components/InviteResultDialog";
import type { RoleSummary } from "@z0/contracts/invites";

export function CreateTenantPage() {
  const navigate = useNavigate();
  const { session, refreshSession, switchOrganization } = useSession();
  const canCreate = sessionHasPermission(session, "tenants:create");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [joinAsAdmin, setJoinAsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [created, setCreated] = useState<TenantSummary | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(name ? slugifyTenantName(name) : "");
    }
  }, [name, slugTouched]);

  async function openInviteDialog() {
    try {
      setRoles(await fetchTenantRoles());
    } catch {
      setRoles([]);
    }
    setInviteOpen(true);
  }

  if (!canCreate) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You need permission to create tenants on this platform.</AlertDescription>
      </Alert>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const tenant = await createTenant({
        name,
        slug,
        joinAsAdmin,
      });
      await refreshSession();
      if (joinAsAdmin) {
        await switchOrganization(tenant.id);
        await refreshSession();
        navigate(`/tenants/${tenant.id}`, { replace: true });
        return;
      }
      setCreated(tenant);
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
        if (!e.problem.errors?.length) setFormError(e.message);
      } else {
        setFormError("Could not create tenant.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInvite(body: { email: string; invitedName: string; roleKeys: string[] }) {
    if (!created) throw new Error("No tenant");
    return createTenantInvite(created.id, body);
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Tenant created</h1>
          <p className="text-muted-foreground text-sm">
            <span className="font-medium text-foreground">{created.name}</span> ({created.slug}) is ready.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void openInviteDialog()}>
            Invite administrator
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={`/tenants/${created.id}`}>View tenant</Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/tenants">All tenants</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCreated(null);
              setName("");
              setSlug("");
              setSlugTouched(false);
              setJoinAsAdmin(false);
              setCreatedInvite(null);
            }}
          >
            Create another
          </Button>
        </div>

        <InviteFormDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roles={
            roles.filter((r) => r.key === "tenant_admin").length > 0
              ? roles.filter((r) => r.key === "tenant_admin")
              : roles
          }
          onSubmit={handleInvite}
          onCreated={(result) => {
            setCreatedInvite(result);
            setInviteOpen(false);
          }}
        />

        <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create tenant</h1>
        <p className="text-muted-foreground text-sm">
          Provision a new tenant on this platform. You can join as administrator or invite someone else to manage it.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-2">
          <Label htmlFor="tenant-name">Name</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="organization"
          />
          {fieldErrors.name ? <p className="text-destructive text-sm">{fieldErrors.name}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenant-slug">Slug</Label>
          <Input
            id="tenant-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-muted-foreground text-xs">Lowercase letters, numbers, and hyphens only.</p>
          {fieldErrors.slug ? <p className="text-destructive text-sm">{fieldErrors.slug}</p> : null}
        </div>

        <div className="flex items-start gap-3">
          <input
            id="join-as-admin"
            type="checkbox"
            checked={joinAsAdmin}
            onChange={(e) => setJoinAsAdmin(e.target.checked)}
            className="border-input mt-1 size-4 rounded border"
          />
          <div className="space-y-1">
            <Label htmlFor="join-as-admin" className="leading-snug">
              Add me as administrator of this tenant
            </Label>
            <p className="text-muted-foreground text-xs">
              When unchecked, you will not be a member until you invite yourself or another administrator accepts an
              invite.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create tenant"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/tenants">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
