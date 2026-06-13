import { NavLink } from "react-router-dom";

import { cn } from "../../lib/utils";

type AppSectionNavProps = {
  appId: string;
};

const SECTIONS: { id: string; label: string; path: (appId: string) => string }[] = [
  { id: "overview", label: "Overview", path: (appId) => `/apps/${appId}` },
  { id: "scopes", label: "Scopes", path: (appId) => `/scopes/${appId}` },
  { id: "users", label: "Users", path: (appId) => `/app-users/${appId}` },
];

export function AppSectionNav({ appId }: AppSectionNavProps) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1"
      aria-label="Application sections"
    >
      {SECTIONS.map((section) => {
        const to = section.path(appId);
        return (
          <NavLink
            key={section.id}
            to={to}
            end={section.id === "overview"}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {section.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
