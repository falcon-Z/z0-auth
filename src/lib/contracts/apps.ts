export type AppStatus = "active" | "disabled";

export type AppSummary = {
  id: string;
  name: string;
  slug: string;
  status: AppStatus;
  redirectUris: string[];
  activeCredentialCount: number;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};

export type AppDetail = AppSummary;

export type CreateAppRequest = {
  name: string;
  redirectUris: string[];
};

export type CreateAppResponse = AppDetail;

export type PatchAppRequest = {
  name?: string;
  redirectUris?: string[];
  status?: AppStatus;
};

export type CredentialStatus = "active" | "revoked";

export type AppCredentialSummary = {
  id: string;
  clientId: string;
  label: string;
  status: CredentialStatus;
  createdAt: string;
  revokedAt: string | null;
};

export type CreateCredentialRequest = {
  label?: string;
};

export type CreateCredentialResponse = {
  credential: AppCredentialSummary;
  clientSecret: string;
};

export type RotateCredentialResponse = CreateCredentialResponse;
