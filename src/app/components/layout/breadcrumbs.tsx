import { useLocation, Link } from "react-router";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);

  // Don't show breadcrumbs on root or dashboard home
  if (pathnames.length === 0 || pathnames[0] !== "dashboard") {
    return null;
  }

  // Remove 'dashboard' from the start for cleaner breadcrumbs
  const breadcrumbPaths = pathnames.slice(1);

  // If no additional paths, just show "Dashboard"
  if (breadcrumbPaths.length === 0) {
    return (
      <div className="flex items-center text-sm text-muted-foreground ml-4">
        <span>Dashboard</span>
      </div>
    );
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

  return (
    <div className="flex items-center text-sm text-muted-foreground ml-4">
      {/* Home / Dashboard link */}
      <Link
        to="/dashboard"
        className="hover:text-foreground transition-colors"
      >
        Dashboard
      </Link>

      {/* Breadcrumb trail */}
      {breadcrumbPaths.map((path, index) => {
        const isLast = index === breadcrumbPaths.length - 1;
        const to = `/dashboard/${breadcrumbPaths.slice(0, index + 1).join("/")}`;

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
