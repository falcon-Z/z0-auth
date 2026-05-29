import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Button } from "@z0/components/ui/button";
import { useSession } from "../../context/session-context";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

function navClassName(isActive: boolean): string {
  return isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground";
}

export function ConsoleLayout() {
  const location = useLocation();
  const { session, signOut } = useSession();
  const platformRoles = session.roles?.join(", ") ?? "—";
  const orgRoles = session.tenantRoles?.join(", ") ?? "—";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Z0 Auth</p>
            <h1 className="text-lg font-semibold">Management console</h1>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <OrganizationSwitcher />
            <div className="text-sm">
              <p className="font-medium text-foreground">{session.user.name}</p>
              <p className="text-muted-foreground">{session.user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Platform: {platformRoles}
                {session.tenant ? ` · Organization: ${orgRoles}` : null}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl items-center justify-between border-t px-6 py-2">
          <nav className="flex items-center gap-6 text-sm" aria-label="Main">
            <NavLink to="/" className={({ isActive }) => navClassName(isActive)} end>
              Dashboard
            </NavLink>
            <NavLink to="/clients" className={({ isActive }) => navClassName(isActive)}>
              Clients
            </NavLink>
          </nav>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6" key={location.pathname + (session.tenant?.id ?? "")}>
        <Outlet />
      </main>
    </div>
  );
}
