import type { BunRequest } from "bun";

import type { SignInMethod } from "@z0/contracts/auth-settings";

import { resolveAuthRealm, type AppAuthRealm } from "../../api/lib/auth-realm";
import { resolveHostedSignInMethods } from "../../api/lib/auth-settings";
import {
  appSessionCookieHeader,
  createAppSession,
} from "../../api/lib/app-session";
import { ensureGroupMemberForAppUser } from "../../api/lib/group-sso";
import { getDb } from "../../api/lib/db";
import { validateFormCsrf } from "../../api/lib/csrf";
import { consumeMagicLinkToken, previewMagicLinkToken, sendMagicLinkForHostedAuth } from "../../api/lib/magic-link";
import { isSmtpReady } from "../../api/lib/smtp-settings";
import { createSession, sessionCookieHeader, revokeSessionByToken, SESSION_COOKIE } from "../../api/lib/session";
import { parseCookies } from "../../api/lib/csrf";
import { redirectForAuthPage } from "../ui-guard";
import { authFormErrorStatus, htmlFormRedirect, htmxAuthErrorHeaders } from "../htmx";
import { parseFormBody } from "../forms";
import { escapeHtml, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";
import { safeReturnPath } from "../safe-return-path";
import { renderInvalidClientPage, renderLoginForm } from "./routes";
import { renderMagicLinkOutcomePage } from "./login-ui";
import {
  createAppUserMfaChallenge,
  createConsoleMfaChallenge,
  hasAppUserMfa,
  hasConsoleMfa,
} from "../../api/lib/mfa";

type AppLoginContext = Pick<AppAuthRealm, "clientId" | "appName">;

function htmlResponse(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status, headers });
}

function authErrorResponse(html: string, req: BunRequest, fallbackStatus: number, setCookie?: string): Response {
  const status = authFormErrorStatus(req, fallbackStatus);
  const extra = status === 200 ? htmxAuthErrorHeaders() : undefined;
  return withSetCookie(htmlResponse(html, status, extra), setCookie);
}

async function problemFieldErrors(res: Response): Promise<{ field: string; message: string }[]> {
  try {
    const body = (await res.json()) as { errors?: { field: string; message: string }[]; detail?: string; title?: string };
    if (body.errors?.length) {
      return body.errors.map((e) => ({ field: e.field, message: e.message }));
    }
    if (body.detail) return [{ field: "_form", message: body.detail }];
    if (body.title) return [{ field: "_form", message: body.title }];
  } catch {
    /* ignore */
  }
  return [{ field: "_form", message: "Request failed. Check your input and try again." }];
}

function renderMagicLinkConfirmPage(
  csrfToken: string,
  rawToken: string,
  options: { returnTo?: string; clientId?: string },
): string {
  const action = `/auth/magic-link/${encodeURIComponent(rawToken)}/accept`;
  return renderAuthPage({
    title: "Confirm sign-in",
    description: "Click continue to finish signing in.",
    csrfToken,
    body: `<form method="post" action="${escapeHtml(action)}" class="auth-card">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      ${options.returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(options.returnTo)}" />` : ""}
      ${options.clientId ? `<input type="hidden" name="client_id" value="${escapeHtml(options.clientId)}" />` : ""}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Continue</button>
      </div>
    </form>`,
  });
}

function renderMagicLinkExpiredPage(csrfToken: string, message: string): string {
  return renderAuthPage({
    title: "Sign-in link expired",
    description: message,
    csrfToken,
    body: `<div class="auth-card">
      <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>
    </div>`,
  });
}

async function resolveLoginContext(req: BunRequest, options?: { clientId?: string; returnTo?: string }) {
  const realm = await resolveAuthRealm(req, options);
  if (realm.mode === "invalid") {
    return {
      realm,
      signInMethods: [] as SignInMethod[],
      smtpReady: false,
      app: undefined as AppLoginContext | undefined,
    };
  }

  const smtpReady = await isSmtpReady();
  const signInMethods =
    realm.mode === "app"
      ? await resolveHostedSignInMethods({
          realm: "app",
          appId: realm.appId,
          appName: realm.appName,
          smtpReady,
        })
      : await resolveHostedSignInMethods({ realm: "console", smtpReady });

  return {
    realm,
    signInMethods,
    smtpReady,
    app: realm.mode === "app" ? { clientId: realm.clientId, appName: realm.appName } : undefined,
  };
}

async function postMagicLinkPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const context = await resolveLoginContext(req, {
    clientId: form.client_id,
    returnTo: form.return_to,
  });

  if (context.realm.mode === "invalid") {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(renderInvalidClientPage(token, context.realm.message), req, 400, setCookie);
  }

  const redirect = await redirectForAuthPage(req, "login", context.realm);
  if (redirect) return redirect;

  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderLoginForm(token, form, errors, undefined, form.return_to, context.app, {
        signInMethods: context.signInMethods,
        mode: "magic_link",
        smtpReady: context.smtpReady,
      }),
      req,
      403,
      setCookie,
    );
  }

  if (!context.signInMethods.includes("magic_link")) {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderLoginForm(
        token,
        form,
        [{ field: "_form", message: "Email link sign-in is not enabled." }],
        undefined,
        form.return_to,
        context.app,
        { signInMethods: context.signInMethods, mode: "magic_link", smtpReady: context.smtpReady },
      ),
      req,
      403,
      setCookie,
    );
  }

  if (!context.smtpReady) {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderLoginForm(
        token,
        form,
        [{ field: "_form", message: "Email link sign-in is not available until email is configured." }],
        undefined,
        form.return_to,
        context.app,
        { signInMethods: context.signInMethods, mode: "magic_link", smtpReady: context.smtpReady },
      ),
      req,
      503,
      setCookie,
    );
  }

  const outcome = await sendMagicLinkForHostedAuth(req, {
    realm: context.realm.mode === "app" ? "app" : "console",
    email: form.email ?? "",
    appId: context.realm.mode === "app" ? context.realm.appId : undefined,
    appName: context.realm.mode === "app" ? context.realm.appName : undefined,
    clientId: form.client_id,
    returnTo: form.return_to,
  });

  if (!outcome.ok) {
    const errors = await problemFieldErrors(outcome.response);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderLoginForm(token, form, errors, undefined, form.return_to, context.app, {
        signInMethods: context.signInMethods,
        mode: "magic_link",
        smtpReady: context.smtpReady,
      }),
      req,
      outcome.response.status,
      setCookie,
    );
  }

  const { token, setCookie } = preparePageCsrf(req);
  const passwordQuery = new URLSearchParams();
  if (form.return_to) passwordQuery.set("return_to", form.return_to);
  if (form.client_id) passwordQuery.set("client_id", form.client_id);
  passwordQuery.set("mode", "password");
  const passwordFallbackHref = context.signInMethods.includes("password")
    ? `/auth/login?${passwordQuery.toString()}`
    : undefined;

  if (!outcome.sent && outcome.reason === "delivery_failed" && passwordFallbackHref) {
    return withSetCookie(
      htmlResponse(
        renderLoginForm(
          token,
          form,
          [{ field: "_form", message: "We could not email a sign-in link. Enter your password to continue." }],
          undefined,
          form.return_to,
          context.app,
          { signInMethods: context.signInMethods, mode: "password", smtpReady: context.smtpReady },
        ),
      ),
      setCookie,
    );
  }

  if (!outcome.sent && outcome.reason === "delivery_failed") {
    return withSetCookie(
      htmlResponse(
        renderLoginForm(
          token,
          form,
          [{ field: "_form", message: "We could not email a sign-in link. Try again later." }],
          undefined,
          form.return_to,
          context.app,
          { signInMethods: context.signInMethods, mode: "magic_link", smtpReady: context.smtpReady },
        ),
      ),
      setCookie,
    );
  }

  return withSetCookie(
    htmlResponse(
      renderMagicLinkOutcomePage(
        token,
        { sent: outcome.sent, reason: outcome.sent ? undefined : outcome.reason },
        {
          email: form.email ?? "",
          realm: context.realm.mode === "app" ? "app" : "console",
          app: context.app,
          returnTo: form.return_to,
          passwordFallbackHref,
        },
      ),
    ),
    setCookie,
  );
}

async function getMagicLinkConfirmPage(req: BunRequest): Promise<Response> {
  const match = new URL(req.url).pathname.match(/^\/auth\/magic-link\/([^/]+)$/);
  const rawToken = match?.[1] ? decodeURIComponent(match[1]) : "";
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return_to") ?? undefined;
  const clientId = url.searchParams.get("client_id") ?? undefined;

  const preview = await previewMagicLinkToken(rawToken);
  const { token, setCookie } = preparePageCsrf(req);

  if (!preview.ok) {
    const errors = await problemFieldErrors(preview.response);
    const message = errors[0]?.message ?? "This sign-in link is invalid or has expired.";
    return withSetCookie(
      htmlResponse(renderMagicLinkExpiredPage(token, message)),
      setCookie,
    );
  }

  return withSetCookie(
    htmlResponse(renderMagicLinkConfirmPage(token, rawToken, { returnTo, clientId })),
    setCookie,
  );
}

async function postMagicLinkAcceptPage(req: BunRequest): Promise<Response> {
  const match = new URL(req.url).pathname.match(/^\/auth\/magic-link\/([^/]+)\/accept$/);
  const rawToken = match?.[1] ? decodeURIComponent(match[1]) : "";
  const form = await parseFormBody(req);

  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderMagicLinkConfirmPage(token, rawToken, {
        returnTo: form.return_to,
        clientId: form.client_id,
      }),
      req,
      403,
      setCookie,
    );
  }

  const consumed = await consumeMagicLinkToken(rawToken);
  if (!consumed.ok) {
    const { token, setCookie } = preparePageCsrf(req);
    const errors = await problemFieldErrors(consumed.response);
    const message = errors[0]?.message ?? "This sign-in link is invalid or has expired.";
    return withSetCookie(
      htmlResponse(renderMagicLinkExpiredPage(token, message)),
      setCookie,
    );
  }

  let setCookie: string;
  const returnTo = form.return_to;
  if (consumed.realm === "app" && consumed.appId) {
    if (await hasAppUserMfa(consumed.userId, consumed.appId)) {
      const challenge = await createAppUserMfaChallenge(
        req,
        consumed.userId,
        consumed.appId,
        "magic_link",
        returnTo,
      );
      return htmlFormRedirect(req, "/auth/mfa", { setCookie: challenge.setCookie });
    }
    const session = await createAppSession(consumed.userId, consumed.appId, req);
    const [userRow] = await getDb()`SELECT email FROM app_users WHERE id = ${consumed.userId} LIMIT 1`;
    if (userRow) {
      await ensureGroupMemberForAppUser(
        consumed.userId,
        consumed.appId,
        String((userRow as { email: string }).email),
      );
    }
    setCookie = appSessionCookieHeader(session.token, session.expiresAt);
    return htmlFormRedirect(req, safeReturnPath(returnTo, "/oauth/resume"), { setCookie });
  }

  if (await hasConsoleMfa(consumed.userId)) {
    const challenge = await createConsoleMfaChallenge(req, consumed.userId, "magic_link", returnTo);
    return htmlFormRedirect(req, "/auth/mfa", { setCookie: challenge.setCookie });
  }

  const existingConsoleToken = parseCookies(req).get(SESSION_COOKIE);
  if (existingConsoleToken) await revokeSessionByToken(existingConsoleToken);
  const session = await createSession(consumed.userId, req);
  setCookie = sessionCookieHeader(session.token, session.expiresAt);
  return htmlFormRedirect(req, safeReturnPath(returnTo, "/"), { setCookie });
}

export const magicLinkWebRoutes = {
  "/auth/magic-link": {
    POST: postMagicLinkPage,
  },
  "/auth/magic-link/:token": {
    GET: getMagicLinkConfirmPage,
  },
  "/auth/magic-link/:token/accept": {
    POST: postMagicLinkAcceptPage,
  },
};
