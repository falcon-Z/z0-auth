export type BuiltinProviderId = "google" | "apple" | "github" | "facebook";

export const BUILTIN_PROVIDER_IDS: BuiltinProviderId[] = ["google", "apple", "github", "facebook"];

export type IdentityProviderType = "builtin" | "custom";

export type IdentityProviderStatus = "active" | "disabled";

export type IdentityProviderResponse = {
  id: string;
  key: string;
  type: IdentityProviderType;
  builtinId: BuiltinProviderId | null;
  displayName: string;
  enabled: boolean;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userinfoUrl: string | null;
  issuer: string | null;
  jwksUrl: string | null;
  defaultScopes: string;
  clientId: string | null;
  hasClientSecret: boolean;
  status: IdentityProviderStatus;
  callbackUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateIdentityProviderFromTemplateRequest = {
  builtinId: BuiltinProviderId;
  displayName?: string;
  clientId: string;
  clientSecret: string;
  enabled?: boolean;
};

export type CreateCustomIdentityProviderRequest = {
  key: string;
  displayName: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  defaultScopes?: string;
  clientId: string;
  clientSecret: string;
  issuer?: string;
  jwksUrl?: string;
  enabled?: boolean;
};

export type PatchIdentityProviderRequest = {
  displayName?: string;
  enabled?: boolean;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  defaultScopes?: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string | null;
  jwksUrl?: string | null;
  status?: IdentityProviderStatus;
};

export type AppFederationProviderEntry = {
  providerId: string;
  key: string;
  displayName: string;
  instanceEnabled: boolean;
  appEnabled: boolean;
  requestedScopes: string | null;
  sortOrder: number;
};

export type AppFederationSettingsResponse = {
  appId: string;
  providers: AppFederationProviderEntry[];
  updatedAt: string | null;
};

export type PutAppFederationSettingsRequest = {
  providers: {
    providerId: string;
    enabled: boolean;
    requestedScopes?: string | null;
    sortOrder?: number;
  }[];
};

export type HostedFederationProvider = {
  key: string;
  displayName: string;
  startUrl: string;
};
