import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  CircleUser,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LineChart,
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
      {
        id: "members",
        title: "Members",
        path: "/members",
        icon: Users,
        status: "available",
        module: "M01",
        summary: "People who can sign in to the console and manage this instance.",
      },
    ],
  },
  {
    id: "platform",
    title: "Platform",
    items: [
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
    id: "applications",
    title: "Applications",
    items: [
      {
        id: "apps",
        title: "Applications",
        path: "/apps",
        icon: AppWindow,
        status: "available",
        module: "M03",
        summary: "Register apps, credentials, scopes, and end users per application.",
      },
      {
        id: "clients",
        title: "OAuth clients",
        path: "/clients",
        icon: AppWindow,
        status: "planned",
        module: "M09",
        summary: "OAuth authorization settings per application (Phase 4).",
        hideFromSidebar: true,
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
        summary: "Your profile, password, and sessions.",
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
        summary: "Identity provider configuration and login policies.",
      },
      {
        id: "app-groups",
        title: "App groups",
        path: "/app-groups",
        icon: SlidersHorizontal,
        status: "planned",
        module: "P4-M2",
        summary: "Group OAuth clients and enforce SSO allow or deny rules.",
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
        summary: "Searchable security and admin events for this instance.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      {
        id: "settings",
        title: "Settings",
        path: "/settings",
        icon: SlidersHorizontal,
        status: "available",
        module: "P1-UX",
        summary: "Platform-level configuration for this instance.",
        hideFromSidebar: true,
      },
      {
        id: "email",
        title: "Email & SMTP",
        path: "/communications/email",
        icon: Mail,
        status: "available",
        module: "M08",
        summary: "SMTP settings, test send, and password reset email.",
        hideFromSidebar: true,
      },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    items: [
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
