/**
 * OAuth Utilities Index
 * Centralized exports for OAuth functionality
 */

// Core services
export { OAuthService } from "./oauth-service";
export { OAuthProviderFactory } from "./provider-factory";
export { OAuthStateManager } from "./state-manager";

// Base provider and types
export { BaseOAuthProvider } from "./base-provider";
export type {
  OAuthProvider,
  OAuthConfig,
  OAuthTokenResponse,
  OAuthUserInfo,
  OAuthState,
  ExternalIdentityData,
} from "./types";

// Provider implementations
export { GoogleOAuthProvider } from "./providers/google";
export { GitHubOAuthProvider } from "./providers/github";
export { MicrosoftOAuthProvider } from "./providers/microsoft";
export { DiscordOAuthProvider } from "./providers/discord";
export { SlackOAuthProvider } from "./providers/slack";
