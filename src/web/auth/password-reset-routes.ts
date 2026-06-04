import type { BunRequest } from "bun";

import { completePasswordReset, requestPasswordReset } from "../../api/lib/password-reset";
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

function renderStaticMessagePage(title: string, description: string, csrfToken: string, cardBody: string): string {
  return renderAuthPage({
    title,
    description,
    csrfToken,
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
): string {
  const body = `
    <form method="post" action="/auth/forgot-password" class="auth-card" hx-post="/auth/forgot-password" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
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
      <div class="auth-actions">
        <button type="submit" class="auth-button">Send reset link</button>
      </div>
      <p class="auth-footer"><a class="auth-link" href="/auth/login">Back to sign in</a></p>
    </form>`;

  return renderAuthPage({
    title: "Reset password",
    description: "Forgot your password",
    csrfToken,
    body,
  });
}

function renderResetForm(
  csrfToken: string,
  token: string,
  values: Record<string, string> = {},
  errors: { field: string; message: string }[] = [],
): string {
  const body = `
    <form method="post" action="/auth/reset-password/${escapeHtml(token)}" class="auth-card" hx-post="/auth/reset-password/${escapeHtml(token)}" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
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
      <div class="auth-actions">
        <button type="submit" class="auth-button">Update password</button>
      </div>
      <p class="auth-footer"><a class="auth-link" href="/auth/login">Back to sign in</a></p>
    </form>`;

  return renderAuthPage({
    title: "Reset password",
    description: "Set a new password",
    csrfToken,
    body,
  });
}

async function getForgotPasswordPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "forgot-password");
  if (redirect) return redirect;

  const { token, setCookie } = preparePageCsrf(req);

  if (!(await isSmtpReady())) {
    const html = renderStaticMessagePage(
      "Reset password",
      "Email-based reset will be available when SMTP is configured.",
      token,
      `<p class="auth-footer">Self-service password reset is not enabled. Contact your platform operator if you are locked out.</p>
       <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
    );
    return withSetCookie(htmlResponse(html), setCookie);
  }

  return withSetCookie(htmlResponse(renderForgotForm(token)), setCookie);
}

async function postForgotPasswordPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "forgot-password");
  if (redirect) return redirect;

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  const { token, setCookie } = preparePageCsrf(req);

  if (csrfError) {
    const errors = [{ field: "_csrf", message: "Session expired. Refresh and try again." }];
    return authErrorResponse(renderForgotForm(token, form, errors), req, 403, setCookie);
  }

  if (!(await isSmtpReady())) {
    return getForgotPasswordPage(req);
  }

  const res = await requestPasswordReset(req, { email: form.email ?? "" });
  if (res.status === 200) {
    const flash = "If an account exists for that email, you will receive a reset link shortly.";
    return withSetCookie(htmlResponse(renderForgotForm(token, { email: form.email ?? "" }, [], flash)), setCookie);
  }

  let errors: { field: string; message: string }[] = [{ field: "_form", message: "Could not send reset email. Try again." }];
  try {
    const body = (await res.json()) as { errors?: { field: string; message: string }[]; detail?: string };
    if (body.errors?.length) errors = body.errors;
    else if (body.detail) errors = [{ field: "_form", message: body.detail }];
  } catch {
    /* ignore */
  }

  return authErrorResponse(renderForgotForm(token, form, errors), req, res.status === 429 ? 429 : 400, setCookie);
}

async function getResetPasswordPage(req: BunRequest): Promise<Response> {
  const token = resetTokenFrom(req);
  if (!token) return Response.redirect(new URL("/auth/forgot-password", req.url), 302);

  const redirect = await redirectForAuthPage(req, "forgot-password");
  if (redirect) return redirect;

  if (!(await isSmtpReady())) {
    return Response.redirect(new URL("/auth/forgot-password", req.url), 302);
  }

  const { token: csrf, setCookie } = preparePageCsrf(req);
  return withSetCookie(htmlResponse(renderResetForm(csrf, token)), setCookie);
}

async function postResetPasswordPage(req: BunRequest): Promise<Response> {
  const token = resetTokenFrom(req);
  if (!token) return Response.redirect(new URL("/auth/forgot-password", req.url), 302);

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  const { token: csrf, setCookie } = preparePageCsrf(req);

  if (csrfError) {
    const errors = [{ field: "_csrf", message: "Session expired. Refresh and try again." }];
    return authErrorResponse(renderResetForm(csrf, token, form, errors), req, 403, setCookie);
  }

  const res = await completePasswordReset(req, {
    token,
    password: form.password ?? "",
    passwordConfirm: form.passwordConfirm ?? "",
  });

  if (res.status === 200) {
    const headers = new Headers({ Location: "/auth/login?reset=complete" });
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

  return authErrorResponse(renderResetForm(csrf, token, form, errors), req, 400, setCookie);
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
