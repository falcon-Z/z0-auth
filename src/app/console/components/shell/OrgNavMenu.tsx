import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { PRIMARY_NAV } from "../../config/navigation";
import { cn } from "../../lib/utils";

export function isPrimaryNavActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

type OrgNavMenuProps = {
  label: string;
};

export function OrgNavMenu({ label }: OrgNavMenuProps) {
  const { pathname } = useLocation();

  return (
    <div className="flex shrink-0 items-center">
      <Link to="/" className="max-w-[5rem] truncate font-medium hover:underline sm:max-w-none">
        {label}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Choose where to go"
          >
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {PRIMARY_NAV.map((item) => {
            const active = isPrimaryNavActive(pathname, item.path);
            return (
              <DropdownMenuItem key={item.id} asChild>
                <Link
                  to={item.path}
                  className={cn(active && "font-medium")}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
