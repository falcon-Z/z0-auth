import type { BuiltinProviderId } from "@z0/contracts/federation";

export type BuiltinProviderTemplate = {
  id: BuiltinProviderId;
  displayName: string;
  key: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  defaultScopes: string;
  issuer?: string;
  jwksUrl?: string;
};

export const BUILTIN_PROVIDER_TEMPLATES: Record<BuiltinProviderId, BuiltinProviderTemplate> = {
  github: {
    id: "github",
    key: "github",
    displayName: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    defaultScopes: "read:user user:email",
  },
  google: {
    id: "google",
    key: "google",
    displayName: "Google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    defaultScopes: "openid email profile",
    issuer: "https://accounts.google.com",
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  },
  apple: {
    id: "apple",
    key: "apple",
    displayName: "Apple",
    authorizationUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userinfoUrl: "",
    defaultScopes: "name email",
    issuer: "https://appleid.apple.com",
    jwksUrl: "https://appleid.apple.com/auth/keys",
  },
  facebook: {
    id: "facebook",
    key: "facebook",
    displayName: "Facebook",
    authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userinfoUrl: "https://graph.facebook.com/me?fields=id,name,email",
    defaultScopes: "email public_profile",
  },
};

export function builtinTemplate(id: BuiltinProviderId): BuiltinProviderTemplate {
  return BUILTIN_PROVIDER_TEMPLATES[id];
}
