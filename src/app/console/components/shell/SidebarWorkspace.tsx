import { Check, ChevronsUpDown, CircleUser, Loader2, LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
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

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function SidebarWorkspace() {
  const { session, signOut, switchOrganization, switching, switchError } = useSession();
  const { isMobile } = useSidebar();

  const tenantName = session.tenant?.name ?? "No tenant";
  const tenantSlug = session.tenant?.slug;
  const userName = session.user.name;
  const userEmail = session.user.email;
  const canSwitch = Boolean(session.canSwitchOrganization && session.organizations?.length);
  const tenants = session.organizations ?? (session.tenant ? [session.tenant] : []);

  return (
    <div className="space-y-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                aria-label="Workspace and account"
                disabled={switching}
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    {initials(tenantName)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {switching ? "Switching…" : tenantName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{userName}</span>
                </div>
                {switching ? (
                  <Loader2 className="ml-auto size-4 shrink-0 animate-spin opacity-60" aria-hidden />
                ) : (
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials(userName)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                  </div>
                </div>
              </DropdownMenuLabel>

              {canSwitch ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Tenants</DropdownMenuLabel>
                  {tenants.map((tenant) => {
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
                  })}
                </>
              ) : session.tenant ? (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {tenantSlug ? `${tenantName} · ${tenantSlug}` : tenantName}
                  </div>
                </>
              ) : null}

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <CircleUser />
                  Your account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {switchError ? (
        <Alert variant="destructive" className="mx-2 py-2">
          <AlertDescription className="text-xs">{switchError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
