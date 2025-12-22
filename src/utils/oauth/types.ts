/**
 * OAuth Provider Types and Interfaces
 */

export type OAuthProvider =
  | "GOOGLE"
  | "GITHUB"
  | "MICROSOFT"
  | "FACEBOOK"
  | "LINKEDIN"
  | "TWITTER"
  | "DISCORD"
  | "SLACK"
  | "OKTA"
  | "AUTH0"
  | "CUSTOM_OAUTH2";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatar?: string;
  locale?: string;
  raw?: Record<string, any>;
}

export interface OAuthState {
  provider: OAuthProvider;
  organizationId: string;
  returnUrl?: string;
  nonce: string;
  timestamp: number;
}

export interface ExternalIdentityData {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: Date;
  scopes: string[];
  profileData: Record<string, any>;
}
