import type { BunRequest } from "bun";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

import { resolveAuthRealm } from "../../api/lib/auth-realm";
import {
  appSessionCookieHeader,
  createAppSession,
} from "../../api/lib/app-session";
import { ensureGroupMemberForAppUser } from "../../api/lib/group-sso";
import { writeAuditEvent } from "../../api/lib/audit";
import { getDb } from "../../api/lib/db";
import {
  FEDERATION_STATE_COOKIE,
  buildFederationState,
  buildUpstreamAuthorizeUrl,
  clearFederationStateCookieHeader,
  decodeFederationState,
  encodeFederationState,
  exchangeUpstreamCode,
  federationStateCookieHeader,
  loadSecretsForProviderId,
  normalizeProviderProfile,
  resolveFederationOrigin,
  resolveRequestedScopes,
} from "../../api/lib/federation-broker";
import { isProviderEnabledForApp } from "../../api/lib/federation-providers";
import { linkFederationIdentity, storeProviderTokens } from "../../api/lib/federation-linking";
import { checkRateLimit, clientIp } from "../../api/lib/rate-limit";
import { redirectForAuthPage } from "../ui-guard";
import { escapeHtml, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";
import { safeReturnPath } from "../safe-return-path";

const OAUTH_RETURN_COOKIE = "z0_oauth_return";

function getCookie(req: Request, key: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === key) return safeDecodeURIComponent(rest.join("="));
  }
  return null;
}

function htmlErrorPage(req: BunRequest, title: string, message: string): Response {
  const { token, setCookie } = preparePageCsrf(req);
  const html = renderAuthPage({
    title,
    description: message,
    csrfToken: token,
    body: `<div class="auth-card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>`,
  });
  return withSetCookie(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }), setCookie);
}

export async function getFederationStart(req: BunRequest): Promise<Response> {
  const providerKey = req.params.providerKey;
  if (!providerKey) return new Response("Not found", { status: 404 });

  const rate = await checkRateLimit({
    key: `federation-start:${clientIp(req)}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return htmlErrorPage(req, "Too many attempts", "Try again in a few minutes.");
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id")?.trim();
  const returnTo = url.searchParams.get("return_to")?.trim() ?? getCookie(req, OAUTH_RETURN_COOKIE);

  const realm = await resolveAuthRealm(req, { clientId: clientId ?? undefined, returnTo: returnTo ?? undefined });
  if (realm.mode !== "app") {
    const message = realm.mode === "invalid" ? realm.message : "Social sign-in is only available for applications.";
    return htmlErrorPage(req, "Sign-in unavailable", message);
  }

  const redirect = await redirectForAuthPage(req, "login", realm);
  if (redirect) return redirect;

  const provider = await isProviderEnabledForApp(realm.appId, providerKey);
  if (!provider) {
    return htmlErrorPage(req, "Sign-in unavailable", "This sign-in method is not enabled for this application.");
  }

  const secrets = await loadSecretsForProviderId(provider.id);
  if (!secrets) {
    return htmlErrorPage(req, "Sign-in unavailable", "This provider is not configured yet.");
  }

  const state = buildFederationState({
    providerKey: provider.key,
    providerId: provider.id,
    appId: realm.appId,
    clientId: realm.clientId,
    returnTo: returnTo ?? null,
  });

  const scopes = await resolveRequestedScopes(realm.appId, provider.id, secrets.defaultScopes);
  const origin = resolveFederationOrigin(req);
  const upstream = buildUpstreamAuthorizeUrl({
    secrets,
    providerKey: provider.key,
    origin,
    state: state.nonce,
    scopes,
  });

  const headers = new Headers({ Location: upstream });
  headers.append("Set-Cookie", federationStateCookieHeader(encodeFederationState(state)));
  return new Response(null, { status: 302, headers });
}

export async function getFederationCallback(req: BunRequest): Promise<Response> {
  const providerKey = req.params.providerKey;
  if (!providerKey) return new Response("Not found", { status: 404 });

  const rate = await checkRateLimit({
    key: `federation-callback:${clientIp(req)}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return htmlErrorPage(req, "Too many attempts", "Try again in a few minutes.");
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return htmlErrorPage(req, "Sign-in cancelled", "You cancelled sign-in or the provider rejected the request.");
  }

  const code = url.searchParams.get("code");
  const upstreamState = url.searchParams.get("state");
  const stored = decodeFederationState(getCookie(req, FEDERATION_STATE_COOKIE));
  if (!code || !upstreamState || !stored || stored.nonce !== upstreamState || stored.providerKey !== providerKey) {
    return htmlErrorPage(req, "Sign-in failed", "This sign-in request expired. Go back and try again.");
  }

  const provider = await isProviderEnabledForApp(stored.appId, providerKey);
  if (!provider || provider.id !== stored.providerId) {
    return htmlErrorPage(req, "Sign-in unavailable", "This sign-in method is not enabled for this application.");
  }

  const secrets = await loadSecretsForProviderId(provider.id);
  if (!secrets) {
    return htmlErrorPage(req, "Sign-in unavailable", "This provider is not configured yet.");
  }

  try {
    const origin = resolveFederationOrigin(req);
    const tokens = await exchangeUpstreamCode({ secrets, providerKey, origin, code });
    const profile = await normalizeProviderProfile(
      secrets,
      tokens.access_token,
      tokens.id_token,
      stored.nonce,
    );

    const linked = await linkFederationIdentity({
      appId: stored.appId,
      providerId: provider.id,
      profile,
    });
    if (!linked.ok) {
      let message = "We could not link your account. Try another method.";
      try {
        const body = (await linked.response.json()) as { errors?: { message: string }[]; detail?: string };
        message = body.errors?.[0]?.message ?? body.detail ?? message;
      } catch {
        /* use default */
      }
      return htmlErrorPage(req, "Sign-in failed", message);
    }

    await storeProviderTokens({
      appUserId: linked.appUserId,
      providerId: provider.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type ?? "Bearer",
      scope: tokens.scope ?? secrets.defaultScopes,
      expiresIn: tokens.expires_in ?? null,
    });

    const session = await createAppSession(linked.appUserId, stored.appId, req);
    const [userRow] = await getDb()`SELECT email FROM app_users WHERE id = ${linked.appUserId} LIMIT 1`;
    if (userRow) {
      await ensureGroupMemberForAppUser(
        linked.appUserId,
        stored.appId,
        String((userRow as { email: string }).email),
      );
    }

    await writeAuditEvent({
      action: "auth.app_federation_login_succeeded",
      resourceType: "app",
      resourceId: stored.appId,
      payload: { appUserId: linked.appUserId, providerKey: provider.key },
    });

    const resumeTarget = safeReturnPath(stored.returnTo) ?? "/oauth/resume";
    const headers = new Headers({ Location: resumeTarget });
    headers.append("Set-Cookie", appSessionCookieHeader(session.token, session.expiresAt));
    headers.append("Set-Cookie", clearFederationStateCookieHeader());
    return new Response(null, { status: 302, headers });
  } catch {
    return htmlErrorPage(req, "Sign-in failed", "We could not complete sign-in with this provider.");
  }
}

export const federationWebRoutes = {
  "/auth/federation/:providerKey/start": {
    GET: getFederationStart,
  },
  "/auth/federation/:providerKey/callback": {
    GET: getFederationCallback,
  },
} as const;
