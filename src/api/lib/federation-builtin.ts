import type { BuiltinProviderId } from "@z0/contracts/federation";
import type { BuiltinProviderSetupGuide } from "@z0/contracts/federation";

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

export const BUILTIN_PROVIDER_SETUP_GUIDES: Record<BuiltinProviderId, BuiltinProviderSetupGuide> = {
  google: {
    id: "google",
    key: "google",
    displayName: "Google",
    summary: "Sign in with Google accounts using OpenID Connect.",
    docsUrl: "https://developers.google.com/identity/protocols/oauth2",
    credentialFields: ["clientId", "clientSecret"],
    steps: [
      "Create an OAuth client in Google Cloud Console (Web application).",
      "Add the callback URL shown below to Authorized redirect URIs.",
      "Copy the Client ID and Client secret into the fields below.",
    ],
  },
  github: {
    id: "github",
    key: "github",
    displayName: "GitHub",
    summary: "Sign in with GitHub accounts.",
    docsUrl: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps",
    credentialFields: ["clientId", "clientSecret"],
    steps: [
      "Register a new OAuth App in GitHub Developer settings.",
      "Set Authorization callback URL to the callback URL shown below.",
      "Copy the Client ID and generate a Client secret.",
    ],
  },
  apple: {
    id: "apple",
    key: "apple",
    displayName: "Apple",
    summary: "Sign in with Apple for web applications.",
    docsUrl: "https://developer.apple.com/documentation/sign_in_with_apple",
    credentialFields: ["clientId", "appleTeamId", "appleKeyId", "applePrivateKey"],
    steps: [
      "Create a Services ID in Apple Developer and enable Sign in with Apple.",
      "Register the callback URL shown below as a Return URL.",
      "Create a Sign in with Apple key (.p8) and note the Key ID and Team ID.",
      "Paste the Services ID as Client ID and upload the private key contents.",
    ],
  },
  facebook: {
    id: "facebook",
    key: "facebook",
    displayName: "Facebook",
    summary: "Sign in with Facebook accounts.",
    docsUrl: "https://developers.facebook.com/docs/facebook-login/web",
    credentialFields: ["clientId", "clientSecret"],
    steps: [
      "Create a Facebook app and add Facebook Login.",
      "Add the callback URL shown below to Valid OAuth Redirect URIs.",
      "Copy the App ID as Client ID and App secret as Client secret.",
    ],
  },
};

export function listBuiltinSetupGuides(): BuiltinProviderSetupGuide[] {
  return Object.values(BUILTIN_PROVIDER_SETUP_GUIDES);
}
