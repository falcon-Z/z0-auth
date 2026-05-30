import { useCallback, useEffect, useState } from "react";

import type { CreateInviteResponse, PendingInvite, RoleSummary, TenantMember } from "@z0/contracts/invites";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { useSession } from "../../../context/session-context";
import { ApiError, apiFetch } from "../../../lib/api";
import { fieldErrorsFromProblem, firstFieldError, type FieldErrorMap } from "../../../lib/form-errors";

function buildMailto(invite: CreateInviteResponse): string {
  const subject = encodeURIComponent(`Invitation to join — ${invite.invitedName}`);
  const body = encodeURIComponent(
    `You have been invited to join our organization.\n\nOpen this link to accept or decline:\n${invite.inviteUrl}\n\nThis link expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
  );
  return `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
}

export function MembersPage() {
  const { session } = useSession();
  const tenantId = session.tenant?.id;
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(["tenant_member"]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [inviteResult, setInviteResult] = useState<CreateInviteResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setForbidden(false);
    setError(null);
    try {
      const [membersRes, invitesRes, rolesRes] = await Promise.all([
        apiFetch<{ members: TenantMember[] }>(`/api/v1/tenants/${tenantId}/members`),
        apiFetch<{ invites: PendingInvite[] }>(`/api/v1/tenants/${tenantId}/invites`).catch((e) => {
          if (e instanceof ApiError && e.problem.status === 403) return { invites: [] };
          throw e;
        }),
        apiFetch<RoleSummary[]>("/api/v1/roles?scope=tenant"),
      ]);
      setMembers(membersRes.members);
      setInvites(invitesRes.invites);
      setRoles(rolesRes);
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 403) {
        setForbidden(true);
      } else {
        setError(e instanceof Error ? e.message : "Could not load members");
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setFieldErrors({});
    setInviteResult(null);
    try {
      const result = await apiFetch<CreateInviteResponse>(`/api/v1/tenants/${tenantId}/invites`, {
        method: "POST",
        body: { email, invitedName, roleKeys },
      });
      setInviteResult(result);
      setEmail("");
      setInvitedName("");
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      } else {
        setError(e instanceof Error ? e.message : "Invite failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!tenantId) return;
    await apiFetch(`/api/v1/tenants/${tenantId}/invites/${inviteId}`, { method: "DELETE" });
    await load();
  }

  function toggleRole(key: string) {
    setRoleKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
  }

  if (!tenantId) {
    return <p className="text-sm text-muted-foreground">Select a tenant to manage members.</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading members…</p>;
  }

  if (forbidden) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>You do not have permission to view members for this tenant.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ConsolePage
      title="Members"
      description={
        <>
          People in <strong>{session.tenant?.name}</strong>. New users join by invitation only.
        </>
      }
    >
      <div className="space-y-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            They will receive a link to accept or decline. Copy the link or open your email app to send it yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onInvite(e)} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {firstFieldError(fieldErrors, "email") ? (
                <p className="text-sm text-destructive">{firstFieldError(fieldErrors, "email")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={invitedName}
                onChange={(e) => setInvitedName(e.target.value)}
                required
              />
              {firstFieldError(fieldErrors, "invitedName") ? (
                <p className="text-sm text-destructive">{firstFieldError(fieldErrors, "invitedName")}</p>
              ) : null}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tenant roles</legend>
              {roles.map((role) => (
                <label key={role.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roleKeys.includes(role.key)}
                    onChange={() => toggleRole(role.key)}
                  />
                  {role.key.replace("tenant_", "")}
                </label>
              ))}
            </fieldset>
            <Button type="submit" disabled={submitting || roleKeys.length === 0}>
              {submitting ? "Creating invite…" : "Create invitation"}
            </Button>
          </form>

          {inviteResult ? (
            <div className="mt-6 rounded-md border bg-muted/40 p-4 space-y-3">
              <p className="text-sm font-medium">Invitation created</p>
              <p className="text-sm text-muted-foreground break-all">{inviteResult.inviteUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(inviteResult.inviteUrl)}>
                  Copy link
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={buildMailto(inviteResult)}>Open in email</a>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <ul className="divide-y text-sm">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{inv.invitedName}</p>
                    <p className="text-muted-foreground">{inv.email}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void revokeInvite(inv.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.userId} className="py-3">
                <p className="font-medium">{m.name}</p>
                <p className="text-muted-foreground">{m.email}</p>
                <p className="text-xs text-muted-foreground mt-1">Roles: {m.roleKeys.join(", ")}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      </div>
    </ConsolePage>
  );
}
