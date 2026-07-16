import type { BunRequest } from "bun";

import { resolveAppSession } from "../../api/lib/app-session";
import { resolveAuthRealm } from "../../api/lib/auth-realm";
import { resolveAuthConfigForApp } from "../../api/lib/auth-settings";
import { validateFormCsrf } from "../../api/lib/csrf";
import {
  listActiveAppUserSessionsForSelf,
  revokeAllOtherAppUserSessionsForSelf,
  revokeAppUserSessionForSelf,
} from "../../api/lib/app-sessions-mgmt";
import { redirectForAuthPage } from "../ui-guard";
import { parseFormBody } from "../forms";
import { escapeHtml, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";
import { safeReturnPath } from "../safe-return-path";

function htmlResponse(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status, headers });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function getAppSessionsPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "login");
  if (redirect) return redirect;

  const realm = await resolveAuthRealm(req);
  if (realm.mode !== "app") {
    return new Response("Application sign-in is required", { status: 400 });
  }

  const appSession = await resolveAppSession(req);
  if (!appSession || appSession.appId !== realm.appId) {
    const url = new URL(req.url);
    const login = `/auth/login?client_id=${encodeURIComponent(realm.clientId)}&return_to=${encodeURIComponent(url.pathname + url.search)}`;
    return Response.redirect(new URL(login, req.url), 302);
  }

  const config = await resolveAuthConfigForApp(realm.appId, realm.appName);
  const sessions = await listActiveAppUserSessionsForSelf(
    appSession.appUserId,
    appSession.appId,
    appSession.sessionId,
  );

  const { token, setCookie } = preparePageCsrf(req);
  const url = new URL(req.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"), "/");

  const sessionItems = sessions
    .map((session) => {
      const currentBadge = session.isCurrent ? `<span class="auth-session-badge">This device</span>` : "";
      const revokeForm = session.isCurrent
        ? ""
        : `<form method="post" action="/auth/sessions/revoke" class="auth-session-revoke">
            <input type="hidden" name="_csrf" value="${escapeHtml(token)}" />
            <input type="hidden" name="client_id" value="${escapeHtml(realm.clientId)}" />
            <input type="hidden" name="session_id" value="${escapeHtml(session.id)}" />
            <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />
            <button type="submit" class="auth-link">Revoke</button>
          </form>`;

      return `<li class="auth-session-item">
        <div class="auth-session-main">
          <strong>${escapeHtml(session.clientLabel)}</strong> ${currentBadge}
          <span class="auth-session-meta">${escapeHtml(session.ipDisplay ?? "Unknown network")} · Last active ${escapeHtml(formatWhen(session.lastSeenAt))}</span>
        </div>
        ${revokeForm}
      </li>`;
    })
    .join("");

  const otherCount = sessions.filter((s) => !s.isCurrent).length;
  const revokeOthers =
    otherCount > 0
      ? `<form method="post" action="/auth/sessions/revoke-others" class="auth-actions">
          <input type="hidden" name="_csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="client_id" value="${escapeHtml(realm.clientId)}" />
          <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />
          <button type="submit" class="auth-button auth-button-secondary">Sign out other devices (${otherCount})</button>
        </form>`
      : "";

  const body = `
    <div class="auth-card">
      <h2>Active sessions</h2>
      <p class="auth-footer">Devices where you are signed in to this application.</p>
      ${
        sessions.length === 0
          ? `<p class="auth-footer">No active sessions.</p>`
          : `<ul class="auth-session-list">${sessionItems}</ul>`
      }
      ${revokeOthers}
      <p class="auth-footer"><a class="auth-link" href="/auth/security?client_id=${encodeURIComponent(realm.clientId)}">Account security</a></p>
      <p class="auth-footer"><a class="auth-link" href="${escapeHtml(returnTo)}">Back</a></p>
    </div>`;

  const html = renderAuthPage({
    title: "Sessions",
    description: "Manage your signed-in devices",
    csrfToken: token,
    body,
    branding: config.branding,
  });

  return withSetCookie(htmlResponse(html), setCookie);
}

async function postRevokeAppSession(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) return csrfError;

  const clientId = form.client_id?.trim() ?? "";
  const sessionId = form.session_id?.trim() ?? "";
  const returnTo = safeReturnPath(
    form.return_to,
    `/auth/sessions?client_id=${encodeURIComponent(clientId)}`,
  );

  const appSession = await resolveAppSession(req);
  const realm = await resolveAuthRealm(req, { clientId });
  if (!appSession || realm.mode !== "app" || !sessionId) {
    return Response.redirect(new URL(`/auth/login?client_id=${encodeURIComponent(clientId)}`, req.url), 303);
  }

  await revokeAppUserSessionForSelf(
    appSession.appUserId,
    appSession.appId,
    appSession.sessionId,
    sessionId,
  );

  return Response.redirect(new URL(returnTo, req.url), 303);
}

async function postRevokeOtherAppSessions(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) return csrfError;

  const clientId = form.client_id?.trim() ?? "";
  const returnTo = safeReturnPath(
    form.return_to,
    `/auth/sessions?client_id=${encodeURIComponent(clientId)}`,
  );

  const appSession = await resolveAppSession(req);
  const realm = await resolveAuthRealm(req, { clientId });
  if (!appSession || realm.mode !== "app") {
    return Response.redirect(new URL(`/auth/login?client_id=${encodeURIComponent(clientId)}`, req.url), 303);
  }

  await revokeAllOtherAppUserSessionsForSelf(
    appSession.appUserId,
    appSession.appId,
    appSession.sessionId,
  );

  return Response.redirect(new URL(returnTo, req.url), 303);
}

export const appSessionsWebRoutes = {
  "/auth/sessions": {
    GET: getAppSessionsPage,
  },
  "/auth/sessions/revoke": {
    POST: postRevokeAppSession,
  },
  "/auth/sessions/revoke-others": {
    POST: postRevokeOtherAppSessions,
  },
};
