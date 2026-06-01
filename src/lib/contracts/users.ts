export type UserStatus = "active" | "disabled";

export type PlatformUserSummary = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
  platformRoles: string[];
};

export type UserTenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleKeys: string[];
  joinedAt: string;
};

export type PlatformUserDetail = PlatformUserSummary & {
  tenantMemberships: UserTenantMembership[];
  activeSessionCount: number;
};

export type PatchPlatformUserRequest = {
  status: UserStatus;
};
