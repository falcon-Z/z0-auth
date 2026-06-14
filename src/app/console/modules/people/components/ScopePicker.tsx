import type { PlatformResource } from "@z0/contracts/rbac";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Label } from "@z0/components/ui/label";

/** Scopes reserved for the instance owner — not assignable on custom roles. */
const OWNER_ONLY_SCOPE_KEYS = new Set(["ownership:transfer"]);

type ScopePickerProps = {
  resources: PlatformResource[];
  selected: string[];
  onChange: (scopeKeys: string[]) => void;
  disabled?: boolean;
  /** Omit owner-only scopes (default for custom role create/edit). */
  hideOwnerOnlyScopes?: boolean;
};

function visibleResources(resources: PlatformResource[], hideOwnerOnlyScopes: boolean): PlatformResource[] {
  if (!hideOwnerOnlyScopes) return resources;

  return resources
    .map((resource) => ({
      ...resource,
      scopes: resource.scopes.filter((scope) => !OWNER_ONLY_SCOPE_KEYS.has(scope.key)),
    }))
    .filter((resource) => resource.scopes.length > 0);
}

export function ScopePicker({
  resources,
  selected,
  onChange,
  disabled,
  hideOwnerOnlyScopes = true,
}: ScopePickerProps) {
  function toggle(scopeKey: string, checked: boolean) {
    if (checked) {
      onChange([...new Set([...selected, scopeKey])]);
      return;
    }
    onChange(selected.filter((key) => key !== scopeKey));
  }

  const items = visibleResources(resources, hideOwnerOnlyScopes);

  return (
    <div className="space-y-6">
      {items.map((resource) => (
        <div key={resource.key} className="space-y-3">
          <h3 className="text-sm font-medium">{resource.label}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {resource.scopes.map((scope) => {
              const id = `scope-${scope.key}`;
              return (
                <div key={scope.key} className="flex items-start gap-2 rounded-md border px-3 py-2">
                  <Checkbox
                    id={id}
                    checked={selected.includes(scope.key)}
                    disabled={disabled}
                    onCheckedChange={(value) => toggle(scope.key, value === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={id} className="text-sm font-normal">
                      {scope.label}
                    </Label>
                    {scope.description ? (
                      <p className="text-xs text-muted-foreground">{scope.description}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
