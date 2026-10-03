export type AuthorizeRedirect = {
  registeredRedirectUris: readonly string[];
  requestedRedirectUri: string;
};

export type RedirectAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "redirect_uri_not_registered" };

export type OAuthConsentChallengeInput = {
  responseType: "code";
  appId: string;
  appUserId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  oidcNonce: string | null;
};

export type OAuthConsentChallenge = OAuthConsentChallengeInput & {
  nonce: string;
  purpose: "oauth_consent";
  lifetimeSeconds: number;
};

export type OAuthConsentCompletionInput = Omit<OAuthConsentChallengeInput, "responseType"> & {
  responseType: string;
  nonce: string;
  confirmationNonce: string;
  decision: string;
  sessionId?: string;
};

export type OAuthConsentContext = { appId: string };

export type OAuthConsentCompletion =
  | { outcome: "approved"; code: string; redirectUri: string; state: string | null }
  | { outcome: "denied"; redirectUri: string; state: string | null }
  | { outcome: "missing" }
  | { outcome: "expired" }
  | { outcome: "mismatched" }
  | { outcome: "replayed" };

export interface OAuthConsentChallengeAuthority {
  create(challenge: OAuthConsentChallenge): Promise<void>;
  findContext(nonce: string): Promise<OAuthConsentContext | null>;
  complete(input: OAuthConsentCompletionInput): Promise<OAuthConsentCompletion>;
}

export interface AuthorizationServer {
  authorizeRedirect(input: AuthorizeRedirect): RedirectAuthorization;
  beginConsent(input: OAuthConsentChallengeInput): Promise<{ nonce: string }>;
  findConsentContext(nonce: string): Promise<OAuthConsentContext | null>;
  completeConsent(input: OAuthConsentCompletionInput): Promise<OAuthConsentCompletion>;
}

export function createAuthorizationServer(dependencies: {
  consentChallenges: OAuthConsentChallengeAuthority;
  generateNonce?: () => string;
}): AuthorizationServer {
  const generateNonce = dependencies.generateNonce ?? (() => crypto.randomUUID());

  return {
    authorizeRedirect(input) {
      return input.registeredRedirectUris.includes(input.requestedRedirectUri)
        ? { allowed: true }
        : { allowed: false, reason: "redirect_uri_not_registered" };
    },
    async beginConsent(input) {
      const nonce = generateNonce();
      await dependencies.consentChallenges.create({
        ...input,
        nonce,
        purpose: "oauth_consent",
        lifetimeSeconds: 600,
      });
      return { nonce };
    },
    findConsentContext(nonce) {
      return dependencies.consentChallenges.findContext(nonce);
    },
    completeConsent(input) {
      return dependencies.consentChallenges.complete(input);
    },
  };
}
