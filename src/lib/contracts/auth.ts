export type LoginRequest = {
  email: string;
  password: string;
};

export type SetActiveTenantRequest = {
  tenantId: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

/** Active organization in API responses (stored as tenant in the database). */
export type SessionTenant = {
  id: string;
  name: string;
  slug: string;
};

export type SessionResponse = {
  authenticated: boolean;
  user?: SessionUser;
  /** Platform-scoped role keys. */
  roles?: string[];
  /** Role keys in the active organization. */
  tenantRoles?: string[];
  /** Active organization. */
  tenant?: SessionTenant;
  /** All organizations the user belongs to. */
  organizations?: SessionTenant[];
  /** True when the user belongs to more than one organization; console must show the switcher. */
  canSwitchOrganization?: boolean;
};

export type AuthenticatedSessionPayload = SessionResponse & {
  authenticated: true;
  user: SessionUser;
  roles: string[];
  tenantRoles: string[];
  organizations: SessionTenant[];
  canSwitchOrganization: boolean;
};
