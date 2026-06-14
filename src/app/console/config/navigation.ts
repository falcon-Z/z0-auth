/** Primary destinations — shown in the top bar. */
export const PRIMARY_NAV = [
  { id: "home", label: "Home", path: "/" },
  { id: "apps", label: "Apps", path: "/apps" },
  { id: "team", label: "Team", path: "/team" },
] as const;

export type SearchItemGroup = "Go to" | "Settings" | "Actions";

export type SearchItem = {
  id: string;
  label: string;
  path: string;
  keywords: string[];
  group: SearchItemGroup;
};

/** Everything reachable via search — not duplicated in the top bar. */
export const SEARCH_ITEMS: SearchItem[] = [
  { id: "home", label: "Home", path: "/", keywords: ["dashboard", "overview", "start"], group: "Go to" },
  { id: "apps", label: "Apps", path: "/apps", keywords: ["applications", "clients"], group: "Go to" },
  { id: "team", label: "Team", path: "/team", keywords: ["members", "people", "invites"], group: "Go to" },
  { id: "activity", label: "Activity", path: "/activity", keywords: ["audit", "log", "history", "events"], group: "Go to" },
  { id: "profile", label: "Your account", path: "/profile", keywords: ["password", "profile", "me"], group: "Go to" },
  { id: "settings", label: "Settings", path: "/settings", keywords: ["configure", "instance"], group: "Settings" },
  { id: "email", label: "Email", path: "/settings/email", keywords: ["smtp", "mail", "send"], group: "Settings" },
  {
    id: "sign-in-providers",
    label: "Sign-in providers",
    path: "/settings/sign-in-providers",
    keywords: ["google", "github", "social", "oauth"],
    group: "Settings",
  },
  {
    id: "app-groups",
    label: "App groups",
    path: "/settings/app-groups",
    keywords: ["sso", "group", "related apps"],
    group: "Settings",
  },
  {
    id: "security-settings",
    label: "Security",
    path: "/settings/security",
    keywords: ["encryption", "rate limit"],
    group: "Settings",
  },
  { id: "legal", label: "Legal", path: "/settings/legal", keywords: ["privacy", "terms"], group: "Settings" },
  { id: "access", label: "Manage access", path: "/team/access", keywords: ["roles", "permissions"], group: "Go to" },
  { id: "invite", label: "Invite someone", path: "/team", keywords: ["invite", "add member"], group: "Actions" },
  { id: "add-app", label: "Add an app", path: "/apps", keywords: ["register", "create app"], group: "Actions" },
];

export type AppSidebarItem = {
  id: string;
  label: string;
  path: string;
  /** When true, active only on an exact path match. */
  exact?: boolean;
};

const APP_SIDEBAR_DEFS = [
  { id: "setup", label: "Setup", segment: "setup" },
  { id: "sign-in", label: "Sign-in page", segment: "sign-in" },
  { id: "users", label: "Users", segment: "users", exact: true },
  { id: "invites", label: "Invites", segment: "users/invites" },
  { id: "permissions", label: "Permissions", segment: "permissions" },
] as const;

export function appSidebarItems(appId: string): AppSidebarItem[] {
  return APP_SIDEBAR_DEFS.map((item) => ({
    id: item.id,
    label: item.label,
    path: `/apps/${appId}/${item.segment}`,
    exact: "exact" in item ? item.exact : true,
  }));
}

export type SettingsLink = {
  title: string;
  description: string;
  path: string;
};

export const SETTINGS_LINKS: SettingsLink[] = [
  {
    title: "Email",
    description: "How your service sends mail for invites, password reset, and notifications.",
    path: "/settings/email",
  },
  {
    title: "Sign-in providers",
    description: "Google, GitHub, and other ways people can sign in.",
    path: "/settings/sign-in-providers",
  },
  {
    title: "App groups",
    description: "Related apps that can share sign-in.",
    path: "/settings/app-groups",
  },
  {
    title: "Security",
    description: "Encryption and abuse protection for this instance.",
    path: "/settings/security",
  },
  {
    title: "Legal",
    description: "Privacy and terms shown to your users.",
    path: "/settings/legal",
  },
];
