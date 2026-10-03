export type ResourceSummary = {
  id: string;
  appId: string;
  audience: string;
  name: string;
  status: "active" | "retired";
  scopes: string[];
};
export type CreateResourceRequest = {
  audience: string;
  name: string;
  scopes: string[];
};
export type PatchResourceRequest = { name?: string; scopes?: string[] };
export type ClientResourcePermission = {
  resourceId: string;
  audience: string;
  name: string;
  scopes: string[];
};
export type PutClientResourcePermissionRequest = { scopes: string[] };
