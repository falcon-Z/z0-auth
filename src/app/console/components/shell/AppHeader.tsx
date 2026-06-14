import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { useBreadcrumbContext } from "../../context/breadcrumb-context";
import { useSession } from "../../context/session-context";
import { initialsFromName } from "../../lib/initials";
import { staticBreadcrumbsForPath } from "../../lib/breadcrumbs";
import { ConsoleSearch } from "./ConsoleSearch";
import { HeaderBreadcrumbs } from "./HeaderBreadcrumbs";
import { OrgNavMenu } from "./OrgNavMenu";

export function AppHeader() {
  const location = useLocation();
  const { session, signOut } = useSession();
  const { override } = useBreadcrumbContext();

  const homeLabel = session.organizationName?.trim() || "Home";
  const trail = override ?? staticBreadcrumbsForPath(location.pathname);

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-3 md:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 md:gap-x-3">
          <div className="flex min-w-0 items-center overflow-hidden">
            <OrgNavMenu label={homeLabel} />
            <HeaderBreadcrumbs trail={trail} />
          </div>

          <ConsoleSearch />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1 rounded-full pl-1 pr-1.5"
                aria-label={`${session.user.name}, account menu`}
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-muted text-[10px] font-medium">
                    {initialsFromName(session.user.name)}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="size-3.5 opacity-50 max-md:hidden" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild className="h-auto cursor-pointer py-2.5 focus:bg-accent">
                <Link to="/profile" className="flex w-full items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-none">{session.user.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{session.user.email}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 opacity-50" aria-hidden />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="size-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
