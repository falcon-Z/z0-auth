import { useLocation, Link, useParams } from "react-router";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs() {
  const location = useLocation();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathnames = location.pathname.split("/").filter((x) => x);

  // Handle org-scoped routes: /org/:orgSlug/...
  const isOrgRoute = pathnames[0] === "org" && pathnames.length > 1;
  // Handle admin routes: /admin/...
  const isAdminRoute = pathnames[0] === "admin";

  // Don't show breadcrumbs on root
  if (pathnames.length === 0) {
    return null;
  }

  // Helper to format path names
  const formatPathName = (path: string): string => {
    // Remove IDs (anything that looks like a CUID or UUID)
    if (path.match(/^[a-z0-9]{20,}$/i)) {
      return "Details";
    }

    // Capitalize and replace hyphens with spaces
    return path
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isOrgRoute && orgSlug) {
    // For org routes: /org/slug/dashboard/... -> show paths after slug
    const orgIndex = pathnames.indexOf(orgSlug);
    const breadcrumbPaths = pathnames.slice(orgIndex + 1);

    if (breadcrumbPaths.length === 0 || (breadcrumbPaths.length === 1 && breadcrumbPaths[0] === "dashboard")) {
      return (
        <div className="flex items-center text-sm text-muted-foreground ml-4">
          <span className="text-foreground font-medium">Dashboard</span>
        </div>
      );
    }

    // Filter out "dashboard" if it's the first item
    const displayPaths = breadcrumbPaths[0] === "dashboard" ? breadcrumbPaths.slice(1) : breadcrumbPaths;

    return (
      <div className="flex items-center text-sm text-muted-foreground ml-4">
        <Link
          to={`/org/${orgSlug}/dashboard`}
          className="hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>

        {displayPaths.map((path, index) => {
          const isLast = index === displayPaths.length - 1;
          const to = `/org/${orgSlug}/${displayPaths.slice(0, index + 1).join("/")}`;

          return (
            <div key={to} className="flex items-center">
              <ChevronRight className="h-4 w-4 mx-2" />
              {isLast ? (
                <span className="text-foreground font-medium">
                  {formatPathName(path)}
                </span>
              ) : (
                <Link to={to} className="hover:text-foreground transition-colors">
                  {formatPathName(path)}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (isAdminRoute) {
    const breadcrumbPaths = pathnames.slice(1);

    if (breadcrumbPaths.length === 0) {
      return (
        <div className="flex items-center text-sm text-muted-foreground ml-4">
          <span className="text-foreground font-medium">Admin</span>
        </div>
      );
    }

    return (
      <div className="flex items-center text-sm text-muted-foreground ml-4">
        <Link
          to="/admin"
          className="hover:text-foreground transition-colors"
        >
          Admin
        </Link>

        {breadcrumbPaths.map((path, index) => {
          const isLast = index === breadcrumbPaths.length - 1;
          const to = `/admin/${breadcrumbPaths.slice(0, index + 1).join("/")}`;

          return (
            <div key={to} className="flex items-center">
              <ChevronRight className="h-4 w-4 mx-2" />
              {isLast ? (
                <span className="text-foreground font-medium">
                  {formatPathName(path)}
                </span>
              ) : (
                <Link to={to} className="hover:text-foreground transition-colors">
                  {formatPathName(path)}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default: no breadcrumbs
  return null;
}
