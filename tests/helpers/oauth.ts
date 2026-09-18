import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";

type WebDispatcher = (request: Request) => Promise<Response>;

function cookieFromResponse(response: Response, name: string): string | undefined {
  const raw = response.headers.getSetCookie?.().find((cookie) => cookie.startsWith(`${name}=`));
  const match = raw?.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function approveOAuthConsent(
  dispatch: WebDispatcher,
  input: {
    clientId: string;
    redirectUri: string;
    appSession: string;
    scope: string;
    state: string;
  },
): Promise<string> {
  const request = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    state: input.state,
  });
  const consentPage = await dispatch(new Request(`http://localhost/oauth/authorize?${request}`, {
    headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}` },
  }));
  if (consentPage.status === 302) {
    const code = new URL(consentPage.headers.get("location") ?? "").searchParams.get("code");
    if (!code) throw new Error("OAuth authorization did not return a code");
    return code;
  }

  const html = await consentPage.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";
  const nonce = html.match(/name="consent_nonce" value="([^"]+)"/)?.[1] ?? "";
  const csrfCookie = cookieFromResponse(consentPage, CSRF_COOKIE) ?? csrf;
  const consentCookie = cookieFromResponse(consentPage, "z0_oauth_consent") ?? "";
  const approved = await dispatch(new Request("http://localhost/oauth/authorize", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "http://localhost",
      host: "localhost",
      cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrfCookie)}; z0_oauth_consent=${encodeURIComponent(consentCookie)}; ${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}`,
    },
    body: new URLSearchParams({
      _csrf: csrf,
      ...Object.fromEntries(request),
      consent_nonce: nonce,
      consent: "approve",
    }),
  }));
  const code = new URL(approved.headers.get("location") ?? "").searchParams.get("code");
  if (!code) throw new Error("OAuth consent approval did not return a code");
  return code;
}

export async function loginApplicationIdentity(
  dispatch: WebDispatcher,
  input: { clientId: string; email: string; password: string },
): Promise<string> {
  const loginPage = await dispatch(
    new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(input.clientId)}`),
  );
  const html = await loginPage.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";
  const csrfCookie = cookieFromResponse(loginPage, CSRF_COOKIE) ?? csrf;
  const login = await dispatch(new Request("http://localhost/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "http://localhost",
      host: "localhost",
      cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrfCookie)}`,
    },
    body: new URLSearchParams({
      _csrf: csrf,
      client_id: input.clientId,
      email: input.email,
      password: input.password,
    }),
  }));
  const appSession = cookieFromResponse(login, APP_SESSION_COOKIE);
  if (login.status !== 303 || !appSession) {
    throw new Error("Application Identity login did not create a session");
  }
  return appSession;
}
