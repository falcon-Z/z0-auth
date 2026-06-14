import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { InstanceRoleSummary } from "@z0/contracts/rbac";
import { Button } from "@z0/components/ui/button";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@z0/components/ui/popover";
import { ScrollArea } from "@z0/components/ui/scroll-area";
import { cn } from "../../lib/utils";

type RoleMultiSelectProps = {
  roles: InstanceRoleSummary[];
  value: string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

function selectedLabel(roles: InstanceRoleSummary[], value: string[], placeholder: string): string {
  const selected = roles.filter((role) => value.includes(role.id));
  if (selected.length === 0) return placeholder;
  if (selected.length <= 2) return selected.map((role) => role.name).join(", ");
  return `${selected.length} roles selected`;
}

export function RoleMultiSelect({
  roles,
  value,
  onChange,
  disabled,
  id,
  placeholder = "Select roles",
}: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggleRole(roleId: string, checked: boolean) {
    onChange(
      checked ? [...new Set([...value, roleId])] : value.filter((current) => current !== roleId),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "h-auto min-h-9 w-full justify-between px-3 py-2 font-normal",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selectedLabel(roles, value, placeholder)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <ScrollArea className="max-h-60">
          <div className="p-1">
            {roles.map((role) => (
              <label
                key={role.id}
                htmlFor={`role-multi-${role.id}`}
                className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 hover:bg-accent"
              >
                <Checkbox
                  id={`role-multi-${role.id}`}
                  className="mt-0.5"
                  checked={value.includes(role.id)}
                  onCheckedChange={(checked) => toggleRole(role.id, checked === true)}
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm leading-snug">{role.name}</span>
                  {role.description ? (
                    <span className="block text-xs leading-snug text-muted-foreground">{role.description}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
