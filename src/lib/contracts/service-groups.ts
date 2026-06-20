export type ServiceGroupAppSummary = {
  id: string;
  name: string;
  slug: string;
};

export type ServiceGroupSummary = {
  id: string;
  name: string;
  slug: string;
  ssoEnabled: boolean;
  appCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceGroupDetail = ServiceGroupSummary & {
  apps: ServiceGroupAppSummary[];
};

export type CreateServiceGroupRequest = {
  name: string;
  slug?: string;
  ssoEnabled?: boolean;
  appIds?: string[];
};

export type PatchServiceGroupRequest = {
  name?: string;
  slug?: string;
  ssoEnabled?: boolean;
};

export type PutServiceGroupAppsRequest = {
  appIds: string[];
};
