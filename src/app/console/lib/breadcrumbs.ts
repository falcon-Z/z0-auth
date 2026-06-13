export type BreadcrumbSegment = {
  label: string;
  to?: string;
};

export function staticBreadcrumbsForPath(pathname: string): BreadcrumbSegment[] {
  if (pathname === "/") return [];

  if (pathname === "/settings") return [{ label: "Settings" }];
  if (pathname === "/communications/email") {
    return [
      { label: "Settings", to: "/settings" },
      { label: "Email & SMTP" },
    ];
  }

  if (pathname === "/members") return [{ label: "Members" }];
  if (pathname.startsWith("/members/invites/")) {
    return [
      { label: "Members", to: "/members" },
      { label: "Invitation" },
    ];
  }
  if (pathname.startsWith("/members/")) {
    return [
      { label: "Members", to: "/members" },
      { label: "Member" },
    ];
  }

  if (pathname === "/apps") return [{ label: "Applications" }];
  if (pathname.startsWith("/apps/")) {
    return [
      { label: "Applications", to: "/apps" },
      { label: "Application" },
    ];
  }

  if (pathname === "/scopes") {
    return [
      { label: "Applications", to: "/apps" },
      { label: "Scopes" },
    ];
  }
  if (pathname.startsWith("/scopes/")) {
    const appId = pathname.split("/")[2];
    return [
      { label: "Applications", to: "/apps" },
      { label: "Application", to: appId ? `/apps/${appId}` : "/apps" },
      { label: "Scopes" },
    ];
  }

  if (pathname === "/app-users") {
    return [
      { label: "Applications", to: "/apps" },
      { label: "Users" },
    ];
  }
  if (pathname.startsWith("/app-users/")) {
    const parts = pathname.split("/").filter(Boolean);
    const appId = parts[1];
    const appUsersPath = appId ? `/app-users/${appId}` : "/app-users";

    if (parts[2] === "invites" && parts[3]) {
      return [
        { label: "Applications", to: "/apps" },
        { label: "Application", to: appId ? `/apps/${appId}` : "/apps" },
        { label: "Users", to: appUsersPath },
        { label: "Invitation" },
      ];
    }
    if (parts[2] && parts[2] !== "invites") {
      return [
        { label: "Applications", to: "/apps" },
        { label: "Application", to: appId ? `/apps/${appId}` : "/apps" },
        { label: "Users", to: appUsersPath },
        { label: "User" },
      ];
    }
    return [
      { label: "Applications", to: "/apps" },
      { label: "Application", to: appId ? `/apps/${appId}` : "/apps" },
      { label: "Users" },
    ];
  }

  if (pathname === "/profile") return [{ label: "Your account" }];
  if (pathname === "/profile/security") {
    return [
      { label: "Your account", to: "/profile" },
      { label: "Password" },
    ];
  }
  if (pathname === "/profile/sessions") {
    return [
      { label: "Your account", to: "/profile" },
      { label: "Sessions" },
    ];
  }

  const navTitle = pathname.split("/").filter(Boolean).pop();
  return navTitle ? [{ label: navTitle.replace(/-/g, " ") }] : [];
}
