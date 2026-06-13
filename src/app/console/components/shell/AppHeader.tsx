import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, LogOut, Settings } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@z0/components/ui/tooltip";
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

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <Link to="/settings" aria-label="Settings">
                  <Settings className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-full pl-1 pr-1.5"
                aria-label={`${session.user.name}, account menu`}
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-muted text-[10px] font-medium">
                    {initialsFromName(session.user.name)}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="size-3.5 opacity-50" aria-hidden />
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
