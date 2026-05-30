import type { ReactNode } from "react";

import type { RoleSummary } from "@z0/contracts/invites";
import { Label } from "@z0/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { formatRoleKey } from "../../../lib/tenant-permissions";

type RolePickerProps = {
  roles: RoleSummary[];
  roleKeys: string[];
  onChange: (keys: string[]) => void;
  error?: string;
};

type RoleSelectProps = {
  roles: RoleSummary[];
  roleKey: string;
  onChange: (key: string) => void;
  error?: string;
};

export function RoleSelect({ roles, roleKey, onChange, error }: RoleSelectProps) {
  return (
    <Field label="Role" error={error}>
      <Select value={roleKey} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.key} value={role.key}>
              {formatRoleKey(role.key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function RolePicker({ roles, roleKeys, onChange, error }: RolePickerProps) {
  function toggle(key: string) {
    onChange(roleKeys.includes(key) ? roleKeys.filter((k) => k !== key) : [...roleKeys, key]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Roles</legend>
      {roles.map((role) => (
        <label key={role.key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={roleKeys.includes(role.key)}
            onChange={() => toggle(role.key)}
          />
          <span className="capitalize">{formatRoleKey(role.key)}</span>
        </label>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
