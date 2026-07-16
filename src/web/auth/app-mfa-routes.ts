import type { BunRequest } from "bun";

import { resolveAppSessionForApp } from "../../api/lib/app-session";
import { resolveAuthRealm } from "../../api/lib/auth-realm";
import { resolveAuthConfigForApp } from "../../api/lib/auth-settings";
import { writeAuditEvent } from "../../api/lib/audit";
import { validateFormCsrf } from "../../api/lib/csrf";
import {
  beginAppUserMfaEnrollment,
  confirmAppUserMfaEnrollment,
  disableAppUserMfa,
  getAppUserMfaStatus,
  regenerateAppUserRecoveryCodes,
  verifyAppUserMfaProof,
  listAppUserRememberedBrowsers,
  revokeAppUserRememberedBrowser,
} from "../../api/lib/mfa";
import { checkRateLimit, clientIp } from "../../api/lib/rate-limit";
import type { MfaEnrollment } from "@z0/contracts/mfa";
import { parseFormBody } from "../forms";
import { escapeHtml, fieldErrorFor, formErrorsSummary, renderAuthField, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";

type PageOptions = {
  clientId?: string;
  enrollment?: MfaEnrollment;
  recoveryCodes?: string[];
  errors?: Array<{ field: string; message: string }>;
  flash?: string;
};

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function context(req: BunRequest, clientId?: string) {
  const realm = await resolveAuthRealm(req, { clientId });
  if (realm.mode !== "app") return null;
  const session = await resolveAppSessionForApp(req, realm.appId);
  if (!session) return { realm, session: null, config: null };
  return { realm, session, config: await resolveAuthConfigForApp(realm.appId, realm.appName) };
}

async function renderPage(req: BunRequest, options: PageOptions = {}): Promise<Response> {
  const value = await context(req, options.clientId);
  if (!value) return new Response("Application sign-in is required", { status: 400 });
  if (!value.session || !value.config) {
    const url = new URL(req.url);
    const returnTo = `${url.pathname}${url.search}`;
    return Response.redirect(new URL(`/auth/login?client_id=${encodeURIComponent(value.realm.clientId)}&return_to=${encodeURIComponent(returnTo)}`, req.url), 302);
  }
  const status = await getAppUserMfaStatus(value.session.appUserId, value.realm.appId);
  const rememberedBrowsers = status.enabled
    ? await listAppUserRememberedBrowsers(value.session.appUserId, value.realm.appId)
    : [];
  const csrf = preparePageCsrf(req);
  const errors = options.errors ?? [];
  const hidden = `<input type="hidden" name="_csrf" value="${escapeHtml(csrf.token)}" />
    <input type="hidden" name="client_id" value="${escapeHtml(value.realm.clientId)}" />`;
  let content: string;
  if (options.recoveryCodes?.length) {
    content = `<div class="auth-card">
      <h2>Save your recovery codes now</h2>
      <p class="auth-footer">Each code works once. They will not be shown again.</p>
      <pre class="auth-recovery-codes">${escapeHtml(options.recoveryCodes.join("\n"))}</pre>
      <p class="auth-footer"><a class="auth-button" href="/auth/security?client_id=${encodeURIComponent(value.realm.clientId)}">I saved these codes</a></p>
    </div>`;
  } else if (options.enrollment) {
    content = `<form method="post" action="/auth/security" class="auth-card" data-validate>
      <h2>Set up an authenticator</h2>
      ${formErrorsSummary(errors)}
      <p class="auth-footer">Scan this QR code with your authenticator. You can also open the setup link or enter the key manually.</p>
      <div class="auth-mfa-qr"><canvas data-mfa-qr="${escapeHtml(options.enrollment.provisioningUri)}" aria-label="Authenticator setup QR code" role="img"></canvas></div>
      <p><a class="auth-button auth-button-secondary" href="${escapeHtml(options.enrollment.provisioningUri)}">Open authenticator app</a></p>
      <p class="auth-footer">Manual setup key</p>
      <code class="auth-setup-key">${escapeHtml(options.enrollment.secret)}</code>
      ${renderAuthField({ id: "code", name: "code", label: "Six-digit code", required: true, autocomplete: "one-time-code", error: fieldErrorFor(errors, "code"), msgRequired: "Enter the code from your authenticator" })}
      ${hidden}<input type="hidden" name="action" value="confirm" />
      <div class="auth-actions"><button class="auth-button" type="submit">Verify and enable</button></div>
    </form>`;
  } else if (status.enabled) {
    content = `<div class="auth-card">
      <h2>MFA is enabled</h2>
      ${options.flash ? `<p class="auth-flash auth-flash--success">${escapeHtml(options.flash)}</p>` : ""}
      ${formErrorsSummary(errors)}
      <p class="auth-footer">${status.recoveryCodesRemaining} recovery codes remain.</p>
      <form method="post" action="/auth/security" data-validate>
        ${renderAuthField({ id: "code", name: "code", label: "Authentication or recovery code", required: true, autocomplete: "one-time-code", error: fieldErrorFor(errors, "code") })}
        ${hidden}
        <div class="auth-actions">
          <button class="auth-button auth-button-secondary" type="submit" name="action" value="recovery-codes">Replace recovery codes</button>
          <button class="auth-link" type="submit" name="action" value="disable">Disable MFA</button>
        </div>
      </form>
      ${rememberedBrowsers.length > 0 ? `<h3>Remembered browsers</h3><ul class="auth-session-list">${rememberedBrowsers.map((browser) => `<li class="auth-session-item"><div class="auth-session-main"><strong>${escapeHtml(browser.clientLabel)}</strong><span class="auth-session-meta">Last used ${escapeHtml(new Date(browser.lastUsedAt).toLocaleString())}</span></div><form method="post" action="/auth/security">${hidden}<input type="hidden" name="action" value="revoke-browser" /><input type="hidden" name="browser_id" value="${escapeHtml(browser.id)}" /><button type="submit" class="auth-link">Revoke</button></form></li>`).join("")}</ul>` : ""}
      <p class="auth-footer"><a class="auth-link" href="/auth/sessions?client_id=${encodeURIComponent(value.realm.clientId)}">Manage sessions</a></p>
    </div>`;
  } else {
    content = `<form method="post" action="/auth/security" class="auth-card">
      <h2>Authenticator app</h2>
      <p class="auth-footer">Require a time-based code after sign-in and create recovery codes for account recovery.</p>
      ${hidden}<input type="hidden" name="action" value="start" />
      <div class="auth-actions"><button class="auth-button" type="submit">Set up authenticator</button></div>
      <p class="auth-footer"><a class="auth-link" href="/auth/sessions?client_id=${encodeURIComponent(value.realm.clientId)}">Manage sessions</a></p>
    </form>`;
  }
  const html = renderAuthPage({
    title: "Account security",
    description: "Manage multi-factor authentication for this application.",
    csrfToken: csrf.token,
    body: content,
    branding: value.config.branding,
  });
  return withSetCookie(htmlResponse(html), csrf.setCookie);
}

async function getSecurityPage(req: BunRequest): Promise<Response> {
  return renderPage(req);
}

async function postSecurityPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) return csrfError;
  const value = await context(req, form.client_id);
  if (!value || !value.session || value.realm.mode !== "app") {
    return Response.redirect(new URL(`/auth/login?client_id=${encodeURIComponent(form.client_id ?? "")}`, req.url), 303);
  }
  const page = { clientId: value.realm.clientId };
  const rate = await checkRateLimit({
    key: `app-mfa-manage:${value.session.appUserId}:${clientIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) return renderPage(req, { ...page, errors: [{ field: "_rate", message: "Too many attempts. Try again later." }] });

  if (form.action === "start") {
    const enrollment = await beginAppUserMfaEnrollment(value.session.appUserId, value.realm.appId);
    if (!enrollment) return renderPage(req, { ...page, errors: [{ field: "_form", message: "MFA is already enabled or setup is unavailable." }] });
    await writeAuditEvent({ action: "mfa.enrollment_started", resourceType: "app_user", resourceId: value.session.appUserId, payload: { realm: "app", appId: value.realm.appId } });
    return renderPage(req, { ...page, enrollment });
  }

  if (form.action === "confirm") {
    const recoveryCodes = await confirmAppUserMfaEnrollment(value.session.appUserId, form.code ?? "");
    if (!recoveryCodes) return renderPage(req, { ...page, errors: [{ field: "code", message: "Enter a valid six-digit code. Start setup again if it expired." }] });
    await writeAuditEvent({ action: "mfa.enabled", resourceType: "app_user", resourceId: value.session.appUserId, payload: { realm: "app", appId: value.realm.appId, recoveryCodeCount: recoveryCodes.length } });
    return renderPage(req, { ...page, recoveryCodes });
  }

  if (form.action === "revoke-browser") {
    const revoked = await revokeAppUserRememberedBrowser(
      value.session.appUserId,
      value.realm.appId,
      form.browser_id ?? "",
    );
    if (!revoked) return renderPage(req, { ...page, errors: [{ field: "_form", message: "Remembered browser not found." }] });
    await writeAuditEvent({ action: "mfa.remembered_browser_revoked", resourceType: "app_user", resourceId: value.session.appUserId, payload: { realm: "app", appId: value.realm.appId, browserId: form.browser_id } });
    return renderPage(req, { ...page, flash: "Remembered browser revoked." });
  }

  const proof = await verifyAppUserMfaProof(value.session.appUserId, form.code ?? "");
  if (!proof.ok) return renderPage(req, { ...page, errors: [{ field: "code", message: "Enter a valid authentication or recovery code." }] });
  if (form.action === "recovery-codes") {
    const recoveryCodes = await regenerateAppUserRecoveryCodes(value.session.appUserId);
    await writeAuditEvent({ action: "mfa.recovery_codes_regenerated", resourceType: "app_user", resourceId: value.session.appUserId, payload: { realm: "app", appId: value.realm.appId, recoveryCodeCount: recoveryCodes.length } });
    return renderPage(req, { ...page, recoveryCodes });
  }
  if (form.action === "disable") {
    await disableAppUserMfa(value.session.appUserId, value.session.sessionId);
    await writeAuditEvent({ action: "mfa.disabled", resourceType: "app_user", resourceId: value.session.appUserId, payload: { realm: "app", appId: value.realm.appId } });
    return renderPage(req, { ...page, flash: "MFA was disabled." });
  }
  return renderPage(req, { ...page, errors: [{ field: "_form", message: "Choose an MFA action." }] });
}

export const appMfaWebRoutes = {
  "/auth/security": {
    GET: getSecurityPage,
    POST: postSecurityPage,
  },
} as const;
