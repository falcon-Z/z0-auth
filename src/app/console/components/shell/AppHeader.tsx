import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@z0/components/ui/breadcrumb";
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

export function AppHeader() {
  const location = useLocation();
  const { session, signOut } = useSession();
  const { override } = useBreadcrumbContext();

  const homeLabel = session.organizationName?.trim() || "Home";
  const trail = override ?? staticBreadcrumbsForPath(location.pathname);
  const onHome = location.pathname === "/";

  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 md:px-6">
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              {onHome ? (
                <BreadcrumbPage className="font-medium">{homeLabel}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to="/" className="font-medium">
                    {homeLabel}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>

            {trail.map((segment, index) => {
              const isLast = index === trail.length - 1;
              return (
                <span key={`${segment.label}-${index}`} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    {isLast || !segment.to ? (
                      <BreadcrumbPage className="truncate">{segment.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={segment.to} className="truncate">
                          {segment.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">Settings</Link>
          </Button>

          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-2 pl-1.5 pr-2.5">
              <Avatar className="size-6">
                <AvatarFallback className="bg-muted text-[10px] font-medium">
                  {initialsFromName(session.user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">Account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/profile/sessions">Sessions</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>
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
