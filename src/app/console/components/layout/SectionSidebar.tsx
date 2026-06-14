import { NavLink, useLocation } from "react-router-dom";

import { cn } from "../../lib/utils";

export type SectionSidebarItem = {
  id: string;
  label: string;
  path: string;
  /** When true, active only on an exact path match. */
  exact?: boolean;
};

function isSidebarItemActive(pathname: string, item: SectionSidebarItem): boolean {
  if (item.exact) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

type SectionSidebarProps = {
  items: SectionSidebarItem[];
  /** Accessible name for the nav landmark. */
  ariaLabel: string;
};

export function SectionSidebar({ items, ariaLabel }: SectionSidebarProps) {
  const { pathname } = useLocation();

  return (
    <nav aria-label={ariaLabel} className="w-full shrink-0 md:w-40 lg:w-44">
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = isSidebarItemActive(pathname, item);
          return (
            <li key={item.id} className="shrink-0 md:shrink">
              <NavLink
                to={item.path}
                end={item.exact}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
