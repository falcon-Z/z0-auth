export type AppStatus = "active" | "disabled";

/** `public` = browser SPA (PKCE, no client secret). `confidential` = server app with secret. */
export type AppClientType = "public" | "confidential";

export type AppSummary = {
  id: string;
  name: string;
  slug: string;
  clientType: AppClientType;
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
  clientType: AppClientType;
};

export type CreateAppResponse = {
  app: AppDetail;
  credential: AppCredentialSummary;
  /** Shown once for confidential clients; null for public clients. */
  clientSecret: string | null;
};

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
  clientSecret: string | null;
};

export type RotateCredentialResponse = CreateCredentialResponse;
