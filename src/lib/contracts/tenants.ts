export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

export type CreateTenantRequest = {
  name: string;
  slug: string;
  joinAsAdmin?: boolean;
};

export type ListTenantsResponse = {
  tenants: TenantSummary[];
};

export type CreateTenantResponse = {
  tenant: TenantSummary;
};
