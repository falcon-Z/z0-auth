import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { useSession } from "../../context/session-context";

export function TenantSwitcher() {
  const { session, switchOrganization, switching, switchError } = useSession();

  if (!session.canSwitchOrganization || !session.organizations?.length) {
    if (!session.tenant) return null;
    return (
      <div className="rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
        <span className="text-muted-foreground">Tenant </span>
        <span className="font-medium text-foreground">{session.tenant.name}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={session.tenant?.id ?? ""}
        onValueChange={(tenantId) => void switchOrganization(tenantId)}
        disabled={switching}
      >
        <SelectTrigger
          id="tenant-switcher"
          className="h-9 w-[14rem] bg-background"
          size="sm"
          aria-label="Switch tenant"
        >
          <SelectValue placeholder="Select tenant" />
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
