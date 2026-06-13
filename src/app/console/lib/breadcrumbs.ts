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
    const parts = pathname.split("/").filter(Boolean);
    const appId = parts[1];
    const appPath = appId ? `/apps/${appId}` : "/apps";

    if (parts[2] === "scopes") {
      return [
        { label: "Applications", to: "/apps" },
        { label: "Application", to: appPath },
        { label: "Scopes" },
      ];
    }

    if (parts[2] === "users") {
      const usersPath = appId ? `/apps/${appId}/users` : "/apps";
      if (parts[3] === "invites" && parts[4]) {
        return [
          { label: "Applications", to: "/apps" },
          { label: "Application", to: appPath },
          { label: "Users", to: usersPath },
          { label: "Invitation" },
        ];
      }
      if (parts[3]) {
        return [
          { label: "Applications", to: "/apps" },
          { label: "Application", to: appPath },
          { label: "Users", to: usersPath },
          { label: "User" },
        ];
      }
      return [
        { label: "Applications", to: "/apps" },
        { label: "Application", to: appPath },
        { label: "Users" },
      ];
    }

    return [
      { label: "Applications", to: "/apps" },
      { label: "Application" },
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
