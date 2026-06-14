export type BreadcrumbSegment = {
  label: string;
  to?: string;
};

function appBasePath(appId: string): string {
  return `/apps/${appId}/setup`;
}

function appSectionTrail(appId: string, sectionLabel: string, sectionPath: string): BreadcrumbSegment[] {
  return [
    { label: "Apps", to: "/apps" },
    { label: "App", to: appBasePath(appId) },
    { label: sectionLabel, to: sectionPath },
  ];
}

export function staticBreadcrumbsForPath(pathname: string): BreadcrumbSegment[] {
  if (pathname === "/") return [];

  if (pathname === "/settings") return [{ label: "Settings" }];
  if (pathname.startsWith("/settings/")) {
    const segment = pathname.replace("/settings/", "");
    const labels: Record<string, string> = {
      email: "Email",
      "sign-in-providers": "Sign-in providers",
      "app-groups": "App groups",
      security: "Security",
      legal: "Legal",
    };
    return [
      { label: "Settings", to: "/settings" },
      { label: labels[segment] ?? segment },
    ];
  }

  if (pathname === "/activity") return [{ label: "Activity" }];

  if (pathname === "/team") return [{ label: "Team" }];
  if (pathname === "/team/roles") {
    return [
      { label: "Team", to: "/team" },
      { label: "Roles" },
    ];
  }
  if (pathname.startsWith("/team/roles/")) {
    return [
      { label: "Team", to: "/team" },
      { label: "Roles", to: "/team/roles" },
      { label: "Role" },
    ];
  }
  if (pathname.startsWith("/team/invites/")) {
    return [
      { label: "Team", to: "/team" },
      { label: "Invitation" },
    ];
  }
  if (pathname.startsWith("/team/")) {
    return [
      { label: "Team", to: "/team" },
      { label: "Member" },
    ];
  }

  if (pathname === "/apps") return [{ label: "Apps" }];

  if (pathname.startsWith("/apps/")) {
    const parts = pathname.split("/").filter(Boolean);
    const appId = parts[1];
    if (!appId) return [{ label: "Apps" }];

    if (parts[2] === "setup") {
      return [
        { label: "Apps", to: "/apps" },
        { label: "App" },
      ];
    }

    if (parts[2] === "sign-in") {
      return [
        { label: "Apps", to: "/apps" },
        { label: "App", to: appBasePath(appId) },
        { label: "Sign-in page" },
      ];
    }

    if (parts[2] === "permissions") {
      return [
        { label: "Apps", to: "/apps" },
        { label: "App", to: appBasePath(appId) },
        { label: "Permissions" },
      ];
    }

    if (parts[2] === "users") {
      const usersPath = `/apps/${appId}/users`;
      if (parts[3] === "invites" && parts.length === 4) {
        return [
          { label: "Apps", to: "/apps" },
          { label: "App", to: appBasePath(appId) },
          { label: "Invites" },
        ];
      }
      if (parts[3] === "invites" && parts[4]) {
        return [
          ...appSectionTrail(appId, "Users", usersPath),
          { label: "Invitation" },
        ];
      }
      if (parts[3]) {
        return [
          ...appSectionTrail(appId, "Users", usersPath),
          { label: "User" },
        ];
      }
      return [
        { label: "Apps", to: "/apps" },
        { label: "App", to: appBasePath(appId) },
        { label: "Users" },
      ];
    }

    return [
      { label: "Apps", to: "/apps" },
      { label: "App" },
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
