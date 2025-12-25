import { Breadcrumbs } from "./breadcrumbs";
import { UserNav } from "./user-nav";
import { OrgSwitcher } from "./org-switcher";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        {/* Organization Switcher */}
        <div className="mr-6">
          <OrgSwitcher />
        </div>

        {/* Breadcrumbs */}
        <Breadcrumbs />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side: Search, Notifications, User Menu */}
        <div className="flex items-center gap-4">
          {/* Search can be added here later */}

          {/* Notifications can be added here later */}

          {/* User Menu */}
          <UserNav />
        </div>
      </div>
    </header>
  );
}
