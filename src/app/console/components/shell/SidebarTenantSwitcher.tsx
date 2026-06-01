import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { Input } from "@z0/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@z0/components/ui/sidebar";
import { useSession } from "../../context/session-context";

const SEARCH_THRESHOLD = 8;

export function SidebarTenantSwitcher() {
  const { session, switchOrganization, switching, switchError } = useSession();
  const { isMobile } = useSidebar();
  const [query, setQuery] = useState("");

  const tenants = session.organizations ?? (session.tenant ? [session.tenant] : []);
  const showSwitcher = tenants.length > 0;
  const showSearch = tenants.length >= SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.slug?.toLowerCase().includes(q) ?? false),
    );
  }, [query, tenants]);

  if (!showSwitcher) {
    return (
      <p className="px-2 text-xs text-muted-foreground">No tenant selected</p>
    );
  }

  const tenantName = session.tenant?.name ?? "Choose tenant";
  const tenantSlug = session.tenant?.slug;

  return (
    <div className="space-y-2 px-0">
      <p className="px-2 text-xs font-medium text-muted-foreground">Tenant</p>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent"
                aria-label="Switch tenant"
                disabled={switching}
              >
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {switching ? "Switching…" : tenantName}
                  </span>
                  {tenantSlug ? (
                    <span className="truncate text-xs text-muted-foreground">{tenantSlug}</span>
                  ) : null}
                </div>
                {switching ? (
                  <Loader2 className="ml-auto size-4 shrink-0 animate-spin opacity-60" aria-hidden />
                ) : (
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-80 w-(--radix-dropdown-menu-trigger-width) min-w-56 overflow-hidden rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
            >
              {showSearch ? (
                <>
                  <div className="p-2">
                    <Input
                      placeholder="Search tenants…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-8"
                      autoFocus
                    />
                  </div>
                  <DropdownMenuSeparator />
                </>
              ) : (
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"}
                </DropdownMenuLabel>
              )}

              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>
                ) : (
                  filtered.map((tenant) => {
                    const isActive = tenant.id === session.tenant?.id;
                    return (
                      <DropdownMenuItem
                        key={tenant.id}
                        disabled={switching}
                        onClick={() => {
                          if (!isActive) void switchOrganization(tenant.id);
                        }}
                      >
                        {isActive ? <Check className="size-4" /> : <span className="size-4" />}
                        <span className="flex flex-col">
                          <span>{tenant.name}</span>
                          {tenant.slug ? (
                            <span className="text-xs text-muted-foreground">{tenant.slug}</span>
                          ) : null}
                        </span>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {switchError ? (
        <Alert variant="destructive" className="mx-0 py-2">
          <AlertDescription className="text-xs">{switchError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
