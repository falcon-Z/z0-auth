import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  BadgeCheck,
  Building2,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LineChart,
  ListTree,
  Lock,
  Mail,
  MonitorSmartphone,
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
  /** Short module id, e.g. P2-M1 */
  module: string;
  summary: string;
  /** Disable nav when no active tenant is selected */
  requiresTenant?: boolean;
  /** Hide nav when session lacks this tenant permission (see tenant-permissions.ts) */
  requiredPermission?: string;
};

export type ConsoleNavGroup = {
  id: string;
  title: string;
  items: ConsoleNavItem[];
};

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        path: "/",
        icon: LayoutDashboard,
        status: "available",
        module: "P1-M1",
        summary: "Session context and quick links for the active tenant.",
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
    id: "tenant",
    title: "Tenant",
    items: [
      {
        id: "members",
        title: "Members",
        path: "/members",
        icon: Users,
        status: "available",
        module: "P2-M1",
        summary: "Members and invitations.",
        requiresTenant: true,
        requiredPermission: "users:read",
      },
      {
        id: "users",
        title: "Users",
        path: "/users",
        icon: BadgeCheck,
        status: "available",
        module: "P2-M2",
        summary: "Platform user lifecycle — disable and re-enable accounts.",
        requiredPermission: "platform:manage",
      },
      {
        id: "roles",
        title: "Roles & permissions",
        path: "/roles",
        icon: ShieldCheck,
        status: "planned",
        module: "P2-M1",
        summary: "Tenant role catalog and permission assignments.",
        requiresTenant: true,
      },
      {
        id: "create-tenant",
        title: "Create tenant",
        path: "/tenants/new",
        icon: Building2,
        status: "planned",
        module: "P2",
        summary: "Create additional tenants beyond the first setup organization.",
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
    id: "security",
    title: "Security",
    items: [
      {
        id: "sessions",
        title: "Sessions",
        path: "/security/sessions",
        icon: MonitorSmartphone,
        status: "planned",
        module: "P2-M3",
        summary: "List active sessions, revoke one, or revoke all other devices.",
      },
      {
        id: "devices",
        title: "Trusted devices",
        path: "/security/devices",
        icon: Fingerprint,
        status: "planned",
        module: "P2-M4",
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
      {
        id: "account",
        title: "Account security",
        path: "/security/account",
        icon: Lock,
        status: "available",
        module: "P2-M2",
        summary: "Change your console password.",
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

export function findNavItem(pathname: string): ConsoleNavItem | undefined {
  if (pathname === "/") {
    return CONSOLE_NAV_ITEMS.find((item) => item.path === "/");
  }
  return CONSOLE_NAV_ITEMS.find((item) => item.path !== "/" && pathname.startsWith(item.path));
}
