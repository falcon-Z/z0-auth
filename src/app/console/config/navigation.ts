import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  BadgeCheck,
  Building2,
  CircleUser,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LineChart,
  ListTree,
  Mail,
  ScrollText,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Webhook,
} from "lucide-react";

/** Mirrors API & UI delivery catalog status. */
export type ConsoleNavStatus = "available" | "stub" | "planned";

export type ConsoleNavItem = {
  id: string;
  title: string;
  path: string;
  icon: LucideIcon;
  status: ConsoleNavStatus;
  module: string;
  summary: string;
  requiresTenant?: boolean;
  requiredPermission?: string;
  /** Route exists but is reached from identity / header, not sidebar. */
  hideFromSidebar?: boolean;
};

export type ConsoleNavGroup = {
  id: string;
  title: string;
  items: ConsoleNavItem[];
};

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    id: "home",
    title: "",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        path: "/",
        icon: LayoutDashboard,
        status: "available",
        module: "P1-M1",
        summary: "Instance overview.",
      },
    ],
  },
  {
    id: "platform",
    title: "Platform",
    items: [
      {
        id: "users",
        title: "Users",
        path: "/users",
        icon: BadgeCheck,
        status: "available",
        module: "M01",
        summary: "All accounts on this IAM instance.",
      },
      {
        id: "analytics",
        title: "Analytics",
        path: "/analytics",
        icon: LineChart,
        status: "planned",
        module: "P6-M2",
        summary: "Aggregated sign-ins, errors, and session metrics for admins.",
      },
    ],
  },
  {
    id: "team",
    title: "Team",
    items: [
      {
        id: "members",
        title: "Members",
        path: "/members",
        icon: Users,
        status: "available",
        module: "M01",
        summary: "People who can use the console.",
      },
    ],
  },
  {
    id: "applications",
    title: "Applications",
    items: [
      {
        id: "clients",
        title: "OAuth clients",
        path: "/clients",
        icon: AppWindow,
        status: "stub",
        module: "P3-M3",
        summary: "Register redirect URIs, rotate secrets, and scope client credentials.",
        requiresTenant: true,
      },
      {
        id: "scopes",
        title: "Scopes",
        path: "/scopes",
        icon: ListTree,
        status: "planned",
        module: "P4-M1",
        summary: "Scope registry and consent configuration for applications.",
        requiresTenant: true,
      },
      {
        id: "oidc",
        title: "OIDC playground",
        path: "/oidc",
        icon: Webhook,
        status: "planned",
        module: "P3-M2",
        summary: "Fetch discovery, inspect JWKS, and sample userinfo for this instance.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      {
        id: "profile",
        title: "Your account",
        path: "/profile",
        icon: CircleUser,
        status: "available",
        module: "P2-UX",
        summary: "Your profile, tenants, password, and sessions.",
        hideFromSidebar: true,
      },
    ],
  },
  {
    id: "security",
    title: "Security",
    items: [
      {
        id: "devices",
        title: "Trusted devices",
        path: "/security/devices",
        icon: Fingerprint,
        status: "planned",
        module: "post-MFA",
        summary: "Device trust list with trust and revoke actions.",
      },
      {
        id: "mfa",
        title: "Multi-factor auth",
        path: "/security/mfa",
        icon: Shield,
        status: "planned",
        module: "P5-M1",
        summary: "TOTP enrollment, backup codes, and admin reset flows.",
      },
      {
        id: "passkeys",
        title: "Passkeys",
        path: "/security/passkeys",
        icon: KeyRound,
        status: "planned",
        module: "P5-M2",
        summary: "WebAuthn credentials for passwordless sign-in.",
      },
    ],
  },
  {
    id: "federation",
    title: "Federation",
    items: [
      {
        id: "sso",
        title: "SSO",
        path: "/sso",
        icon: ShieldCheck,
        status: "planned",
        module: "P4-M2",
        summary: "Tenant identity provider configuration and login policies.",
        requiresTenant: true,
      },
      {
        id: "app-groups",
        title: "App groups",
        path: "/app-groups",
        icon: SlidersHorizontal,
        status: "planned",
        module: "P4-M2",
        summary: "Group OAuth clients and enforce SSO allow or deny rules.",
        requiresTenant: true,
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    items: [
      {
        id: "audit",
        title: "Audit log",
        path: "/audit",
        icon: ScrollText,
        status: "planned",
        module: "P4-M3",
        summary: "Searchable security and admin events for the active tenant.",
        requiresTenant: true,
      },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    items: [
      {
        id: "email",
        title: "Email & SMTP",
        path: "/communications/email",
        icon: Mail,
        status: "planned",
        module: "P5-M3",
        summary: "SMTP inheritance, test send, and forgot-password delivery.",
      },
      {
        id: "templates",
        title: "Templates",
        path: "/communications/templates",
        icon: Mail,
        status: "planned",
        module: "P5-M3",
        summary: "Auth email templates with preview and test send.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    items: [
      {
        id: "observability",
        title: "Observability",
        path: "/operations/observability",
        icon: Activity,
        status: "planned",
        module: "P6-M1",
        summary: "Request correlation and troubleshooting hints for operators.",
      },
    ],
  },
];

export const CONSOLE_NAV_ITEMS: ConsoleNavItem[] = CONSOLE_NAV.flatMap((group) => group.items);

export function isConsoleNavItemVisible(item: ConsoleNavItem): boolean {
  return item.status === "available";
}

const PROFILE_TITLES: Record<string, string> = {
  "/profile": "Your account",
  "/profile/security": "Password",
  "/profile/sessions": "Sessions",
};

export function findNavItem(pathname: string): ConsoleNavItem | undefined {
  if (pathname in PROFILE_TITLES) {
    return CONSOLE_NAV_ITEMS.find((item) => item.path === "/profile");
  }
  if (pathname === "/") {
    return CONSOLE_NAV_ITEMS.find((item) => item.path === "/");
  }
  return CONSOLE_NAV_ITEMS.find((item) => item.path !== "/" && pathname.startsWith(item.path));
}

export function pageTitleForPath(pathname: string): string {
  if (pathname in PROFILE_TITLES) return PROFILE_TITLES[pathname]!;
  return findNavItem(pathname)?.title ?? "Console";
}
