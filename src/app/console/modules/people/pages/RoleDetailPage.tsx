import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { InstanceRoleDetail, PlatformResource } from "@z0/contracts/rbac";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { usePermissions } from "../../../hooks/use-permissions";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { FormField } from "../../../components/forms/FormField";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { deleteRole, fetchPlatformResources, fetchRole, patchRole } from "../../../lib/rbac-api";
import { ScopePicker } from "../components/ScopePicker";

export function RoleDetailPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasScope } = usePermissions();
  const canManage = hasScope("roles:manage");

  const [role, setRole] = useState<InstanceRoleDetail | null>(null);
  const [resources, setResources] = useState<PlatformResource[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeKeys, setScopeKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  usePageBreadcrumbs(
    role
      ? [
          { label: "Team", to: "/team" },
          { label: "Roles", to: "/team/roles" },
          { label: role.name },
        ]
      : null,
    [role?.name, roleId],
  );

  async function load() {
    if (!roleId) return;
    setLoading(true);
    setError(null);
    try {
      const [roleData, resourceData] = await Promise.all([fetchRole(roleId), fetchPlatformResources()]);
      setRole(roleData);
      setResources(resourceData);
      setName(roleData.name);
      setDescription(roleData.description);
      setScopeKeys(roleData.scopeKeys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load role");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [roleId]);

  async function handleSave() {
    if (!roleId || !role || role.isSystem) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const updated = await patchRole(roleId, { name, description, scopeKeys });
      setRole(updated);
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!roleId || !role) return;
    const ok = await confirm({
      title: "Delete role",
      description: `Delete ${role.name}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await deleteRole(roleId);
    navigate("/team/roles");
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !role) {
    return (
      <EntityDetailLayout name="Role" backTo="/team/roles" backLabel="Back to roles" tabs={[]}>
        <PageError title="Not found" message={error ?? "Role not found."}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/team/roles">Back to roles</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  return (
    <EntityDetailLayout
      backTo="/team/roles"
      backLabel="Back to roles"
      name={role.name}
      subtitle={role.description || undefined}
      badges={
        <Badge variant={role.isSystem ? "secondary" : "outline"}>{role.isSystem ? "System" : "Custom"}</Badge>
      }
      actions={
        !role.isSystem && canManage ? (
          <Button variant="destructive" onClick={() => void handleDelete()}>
            Delete
          </Button>
        ) : undefined
      }
    >
      <Card className="py-0 shadow-xs">
        <CardContent className="space-y-6 px-5 py-5">
          {role.isSystem ? (
            <p className="text-sm text-muted-foreground">
              System roles are read-only. Assign them to team members from a member profile.
            </p>
          ) : (
            <>
              <FormField label="Name" htmlFor="roleName" error={fieldErrors.name}>
                <Input id="roleName" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
              </FormField>
              <FormField label="Description" htmlFor="roleDescription" error={fieldErrors.description}>
                <Input
                  id="roleDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canManage}
                />
              </FormField>
            </>
          )}

          <FormField label="Permissions" error={fieldErrors.scopeKeys}>
            <ScopePicker
              resources={resources}
              selected={scopeKeys}
              onChange={setScopeKeys}
              disabled={role.isSystem || !canManage}
            />
          </FormField>

          {!role.isSystem && canManage ? (
            <div className="flex justify-end">
              <Button disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </EntityDetailLayout>
  );
}
