export type AppStatus = "active" | "disabled";
export type Assurance = "baseline" | "strong";
export type AppClientType = "public" | "confidential";
export type ClientPurpose = "interactive" | "workload";
export type ClientStatus =
  "active" | "disabled" | "pending_deletion" | "purged";

export type AppSummary = {
  id: string;
  name: string;
  slug: string;
  status: AppStatus;
  minimumAssurance: Assurance;
  activeClientCount: number;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};
export type AppDetail = AppSummary;
export type OAuthClientSummary = {
  id: string;
  appId: string;
  clientId: string;
  label: string;
  clientType: AppClientType;
  purpose: ClientPurpose;
  status: ClientStatus;
  redirectUris: string[];
  browserOrigins: string[];
  refreshEnabled: boolean;
  assuranceOverride: Assurance | null;
  effectiveAssurance: Assurance;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};
export type CreateClientRequest = {
  label: string;
  clientType: AppClientType;
  purpose: ClientPurpose;
  redirectUris?: string[];
  browserOrigins?: string[];
  refreshEnabled?: boolean;
  assuranceOverride?: Assurance | null;
};
export type PatchClientRequest = {
  label?: string;
  redirectUris?: string[];
  browserOrigins?: string[];
  refreshEnabled?: boolean;
  assuranceOverride?: Assurance | null;
  status?: "active" | "disabled";
};
export type CreateClientResponse = {
  client: OAuthClientSummary;
  clientSecret: string | null;
};
export type CreateAppRequest = {
  name: string;
  minimumAssurance?: Assurance;
  initialClient: CreateClientRequest;
};
export type CreateAppResponse = CreateClientResponse & { app: AppDetail };
export type PatchAppRequest = {
  name?: string;
  status?: AppStatus;
  minimumAssurance?: Assurance;
};
export type RotateClientSecretResponse = CreateClientResponse;
