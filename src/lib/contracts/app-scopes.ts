export type AppScopeSummary = {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppScopeRequest = {
  name: string;
  description?: string;
};

export type PatchAppScopeRequest = {
  name?: string;
  description?: string | null;
};
