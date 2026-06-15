import type { BunRequest } from "bun";

import { completeAppPasswordReset, requestAppPasswordReset } from "../../api/lib/app-password-reset";
import { completePasswordReset, requestPasswordReset } from "../../api/lib/password-reset";
import { resolveAuthRealm, findActiveClientIdForApp } from "../../api/lib/auth-realm";
import type { AuthRealm } from "../../api/lib/auth-realm";
import { resolveAuthConfigForApp } from "../../api/lib/auth-settings";
import { verifyResetToken } from "../../api/lib/instance-keys";
import { isSmtpReady } from "../../api/lib/smtp-settings";
import { validateFormCsrf } from "../../api/lib/csrf";
import { redirectForAuthPage } from "../ui-guard";
import { authFormErrorStatus, htmxAuthErrorHeaders } from "../htmx";
import { parseFormBody } from "../forms";
import {
  escapeHtml,
  fieldErrorFor,
  formErrorsSummary,
  renderAuthField,
  renderAuthPage,
  renderPasswordField,
  type AuthPageBranding,
} from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";

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

function clientIdFromRequest(req: BunRequest): string | undefined {
  const url = new URL(req.url);
  return url.searchParams.get("client_id")?.trim() || undefined;
}

async function realmForReset(req: BunRequest, clientId?: string): Promise<AuthRealm> {
  if (!clientId) return { mode: "console" };
  return resolveAuthRealm(req, { clientId });
}

async function brandingForClientId(clientId: string, req: BunRequest): Promise<AuthPageBranding | undefined> {
  const realm = await realmForReset(req, clientId);
  if (realm.mode !== "app") return undefined;
  const config = await resolveAuthConfigForApp(realm.appId, realm.appName);
  return config.branding;
}

function loginBackHref(clientId?: string): string {
  return clientId
    ? `/auth/login?client_id=${encodeURIComponent(clientId)}`
    : "/auth/login";
}

function renderStaticMessagePage(
  title: string,
  description: string,
  csrfToken: string,
  cardBody: string,
  branding?: AuthPageBranding,
): string {
  return renderAuthPage({
    title,
    description,
    csrfToken,
    branding,
    body: `<div class="auth-card"><h2>${escapeHtml(title)}</h2>${cardBody}</div>`,
  });
}

function resetTokenFrom(req: BunRequest): string | null {
  const prefix = "/auth/reset-password/";
  const pathname = new URL(req.url).pathname;
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function renderForgotForm(
  csrfToken: string,
  values: Record<string, string> = {},
  errors: { field: string; message: string }[] = [],
  flash?: string,
  clientId?: string,
  branding?: AuthPageBranding,
): string {
  const hiddenClient = clientId
    ? `<input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />`
    : "";
  const body = `
    <form method="post" action="/auth/forgot-password${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}" class="auth-card" hx-post="/auth/forgot-password${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Reset password</h2>
      <p class="auth-footer">Enter your email and we will send you a link to choose a new password.</p>
      ${flash ? `<p class="auth-flash auth-flash--success" role="status">${escapeHtml(flash)}</p>` : ""}
      ${formErrorsSummary(errors)}
      ${renderAuthField({
        id: "email",
        name: "email",
        label: "Email",
        type: "email",
        value: values.email ?? "",
        required: true,
        autocomplete: "email",
        error: fieldErrorFor(errors, "email"),
        msgRequired: "Enter your email address",
        msgEmail: "Enter an email address like name@example.com",
      })}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      ${hiddenClient}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Send reset link</button>
      </div>
      <p class="auth-footer"><a class="auth-link" href="${escapeHtml(loginBackHref(clientId))}">Back to sign in</a></p>
    </form>`;

  return renderAuthPage({
    title: "Reset password",
    description: clientId ? "Forgot your password" : "Forgot your password",
    csrfToken,
    branding,
    body,
  });
}

function renderResetForm(
  csrfToken: string,
  token: string,
  values: Record<string, string> = {},
  errors: { field: string; message: string }[] = [],
  clientId?: string,
  branding?: AuthPageBranding,
): string {
  const resetAction = `/auth/reset-password/${escapeHtml(token)}${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}`;
  const hiddenClient = clientId
    ? `<input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />`
    : "";
  const body = `
    <form method="post" action="${resetAction}" class="auth-card" hx-post="${resetAction}" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Choose a new password</h2>
      ${formErrorsSummary(errors)}
      ${renderPasswordField({
        value: values.password ?? "",
        autocomplete: "new-password",
        context: { email: values.email ?? "" },
        attempted: errors.some((e) => e.field === "password"),
        failedLabels: errors.filter((e) => e.field === "password").map((e) => e.message),
      })}
      ${renderAuthField({
        id: "passwordConfirm",
        name: "passwordConfirm",
        label: "Confirm password",
        type: "password",
        value: values.passwordConfirm ?? "",
        required: true,
        autocomplete: "new-password",
        error: fieldErrorFor(errors, "passwordConfirm"),
        msgRequired: "Enter your password again to confirm it",
        msgMatch: "Enter the same password in both fields",
        matchSelector: "#password",
      })}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      ${hiddenClient}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Update password</button>
      </div>
      <p class="auth-footer"><a class="auth-link" href="${escapeHtml(loginBackHref(clientId))}">Back to sign in</a></p>
    </form>`;

  return renderAuthPage({
    title: "Reset password",
    description: "Set a new password",
    csrfToken,
    branding,
    body,
  });
}

async function getForgotPasswordPage(req: BunRequest): Promise<Response> {
  const clientId = clientIdFromRequest(req);
  const realm = await realmForReset(req, clientId);
  const branding = clientId ? await brandingForClientId(clientId, req) : undefined;

  const redirect = await redirectForAuthPage(req, "forgot-password", realm);
  if (redirect) return redirect;

  if (realm.mode === "invalid") {
    const { token, setCookie } = preparePageCsrf(req);
    const html = renderStaticMessagePage(
      "Reset password",
      realm.message,
      token,
      `<div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
      branding,
    );
    return withSetCookie(htmlResponse(html), setCookie);
  }

  const { token, setCookie } = preparePageCsrf(req);

  if (!(await isSmtpReady())) {
    const html = renderStaticMessagePage(
      "Reset password",
      "Email-based reset will be available when SMTP is configured.",
      token,
      `<p class="auth-footer">Self-service password reset is not enabled. Contact your platform operator if you are locked out.</p>
       <div class="auth-actions"><a class="auth-button" href="${escapeHtml(loginBackHref(clientId))}">Back to sign in</a></div>`,
      branding,
    );
    return withSetCookie(htmlResponse(html), setCookie);
  }

  return withSetCookie(htmlResponse(renderForgotForm(token, {}, [], undefined, clientId, branding)), setCookie);
}

async function postForgotPasswordPage(req: BunRequest): Promise<Response> {
  const clientId = clientIdFromRequest(req);
  const resolvedClientIdEarly = clientId;
  const realm = await realmForReset(req, resolvedClientIdEarly);
  const branding = clientId ? await brandingForClientId(clientId, req) : undefined;

  const redirect = await redirectForAuthPage(req, "forgot-password", realm);
  if (redirect) return redirect;

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  const { token, setCookie } = preparePageCsrf(req);
  const resolvedClientId = form.client_id?.trim() || clientId;

  if (csrfError) {
    const errors = [{ field: "_csrf", message: "Session expired. Refresh and try again." }];
    return authErrorResponse(renderForgotForm(token, form, errors, undefined, resolvedClientId, branding), req, 403, setCookie);
  }

  if (!(await isSmtpReady())) {
    return getForgotPasswordPage(req);
  }

  const res = resolvedClientId
    ? await requestAppPasswordReset(req, { email: form.email ?? "", clientId: resolvedClientId })
    : await requestPasswordReset(req, { email: form.email ?? "" });

  if (res.status === 200) {
    const flash = "If an account exists for that email, you will receive a reset link shortly.";
    return withSetCookie(
      htmlResponse(renderForgotForm(token, { email: form.email ?? "" }, [], flash, resolvedClientId, branding)),
      setCookie,
    );
  }

  let errors: { field: string; message: string }[] = [{ field: "_form", message: "Could not send reset email. Try again." }];
  try {
    const body = (await res.json()) as { errors?: { field: string; message: string }[]; detail?: string };
    if (body.errors?.length) errors = body.errors;
    else if (body.detail) errors = [{ field: "_form", message: body.detail }];
  } catch {
    /* ignore */
  }

  return authErrorResponse(renderForgotForm(token, form, errors, undefined, resolvedClientId, branding), req, res.status === 429 ? 429 : 400, setCookie);
}

async function getResetPasswordPage(req: BunRequest): Promise<Response> {
  const token = resetTokenFrom(req);
  if (!token) return Response.redirect(new URL("/auth/forgot-password", req.url), 302);

  const clientId = clientIdFromRequest(req);
  const realm = await realmForReset(req, clientId);
  const branding = clientId ? await brandingForClientId(clientId, req) : undefined;

  const redirect = await redirectForAuthPage(req, "forgot-password", realm);
  if (redirect) return redirect;

  if (!(await isSmtpReady())) {
    const forgot = clientId ? `/auth/forgot-password?client_id=${encodeURIComponent(clientId)}` : "/auth/forgot-password";
    return Response.redirect(new URL(forgot, req.url), 302);
  }

  const { token: csrf, setCookie } = preparePageCsrf(req);
  return withSetCookie(htmlResponse(renderResetForm(csrf, token, {}, [], clientId, branding)), setCookie);
}

async function postResetPasswordPage(req: BunRequest): Promise<Response> {
  const token = resetTokenFrom(req);
  if (!token) return Response.redirect(new URL("/auth/forgot-password", req.url), 302);

  const clientId = clientIdFromRequest(req);
  const realm = await realmForReset(req, clientId);
  const branding = clientId ? await brandingForClientId(clientId, req) : undefined;

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  const { token: csrf, setCookie } = preparePageCsrf(req);
  const resolvedClientId = form.client_id?.trim() || clientId;

  if (csrfError) {
    const errors = [{ field: "_csrf", message: "Session expired. Refresh and try again." }];
    return authErrorResponse(renderResetForm(csrf, token, form, errors, resolvedClientId, branding), req, 403, setCookie);
  }

  const resetBody = {
    token,
    password: form.password ?? "",
    passwordConfirm: form.passwordConfirm ?? "",
    clientId: resolvedClientId,
  };

  const verified = await verifyResetToken(token);
  const res =
    verified.ok && verified.payload.realm === "app"
      ? await completeAppPasswordReset(req, resetBody, resolvedClientId)
      : await completePasswordReset(req, resetBody);

  if (res.status === 200) {
    let appClientId = resolvedClientId;
    if (verified.ok && verified.payload.realm === "app" && !appClientId && verified.payload.aid) {
      appClientId = (await findActiveClientIdForApp(verified.payload.aid)) ?? undefined;
    }
    const loginPath = appClientId
      ? `/auth/login?client_id=${encodeURIComponent(appClientId)}&reset=complete`
      : "/auth/login?reset=complete";
    const headers = new Headers({ Location: loginPath });
    return new Response(null, { status: 303, headers });
  }

  let errors: { field: string; message: string }[] = [
    { field: "_form", message: "Could not reset password. Try again or request a new link." },
  ];
  try {
    const body = (await res.json()) as { errors?: { field: string; message: string }[]; detail?: string };
    if (body.errors?.length) errors = body.errors;
    else if (body.detail) errors = [{ field: "_form", message: body.detail }];
  } catch {
    /* ignore */
  }

  return authErrorResponse(renderResetForm(csrf, token, form, errors, resolvedClientId, branding), req, 400, setCookie);
}

export const passwordResetWebRoutes = {
  "/auth/forgot-password": {
    GET: getForgotPasswordPage,
    POST: postForgotPasswordPage,
  },
  "/auth/reset-password/:token": {
    GET: getResetPasswordPage,
    POST: postResetPasswordPage,
  },
} as const;
