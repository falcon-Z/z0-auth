import { Link } from "react-router";
import { Breadcrumbs } from "./breadcrumbs";
import { UserNav } from "./user-nav";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-2 mr-6">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-primary text-primary-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-semibold text-lg">Z0 Auth</span>
        </Link>

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
