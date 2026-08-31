export type AuthorizeRedirect = {
  registeredRedirectUris: readonly string[];
  requestedRedirectUri: string;
};

export type RedirectAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "redirect_uri_not_registered" };

export interface AuthorizationServer {
  authorizeRedirect(input: AuthorizeRedirect): RedirectAuthorization;
}

export function createAuthorizationServer(): AuthorizationServer {
  return {
    authorizeRedirect(input) {
      return input.registeredRedirectUris.includes(input.requestedRedirectUri)
        ? { allowed: true }
        : { allowed: false, reason: "redirect_uri_not_registered" };
    },
  };
}
