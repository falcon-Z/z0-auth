import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { useSession } from "../../context/session-context";

export function OrganizationSwitcher() {
  const { session, switchOrganization, switching, switchError } = useSession();

  if (!session.canSwitchOrganization || !session.organizations?.length) {
    if (!session.tenant) return null;
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">Organization </span>
        <span className="font-medium text-foreground">{session.tenant.name}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground" htmlFor="org-switcher">
        Organization
      </label>
      <Select
        value={session.tenant?.id ?? ""}
        onValueChange={(tenantId) => void switchOrganization(tenantId)}
        disabled={switching}
      >
        <SelectTrigger id="org-switcher" className="min-w-[12rem]" size="sm" aria-label="Switch organization">
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent>
          {session.organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {switchError ? <p className="text-xs text-destructive">{switchError}</p> : null}
    </div>
  );
}
