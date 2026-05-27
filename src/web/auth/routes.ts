import type { BunRequest } from "bun";
import path from "node:path";

import type { SetupRequest } from "@z0/contracts/setup";
import { runLogin } from "../../api/auth/service";
import { buildSessionResponse } from "../../api/lib/auth";
import { validateFormCsrf } from "../../api/lib/csrf";
import { clearSessionCookieHeader, revokeSessionByToken, SESSION_COOKIE } from "../../api/lib/session";
import { parseCookies } from "../../api/lib/csrf";
import { runSetup } from "../../api/setup/service";
import { redirectForAuthPage } from "../ui-guard";
import { parseFormBody } from "../forms";
import {
  escapeHtml,
  fieldErrorFor,
  fieldErrorMessages,
  formErrorsSummary,
  renderAuthField,
  renderAuthPage,
  renderPasswordField,
  type Flash,
} from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";

const STATIC_DIR = path.join(import.meta.dir, "../static");
const AUTH_CSS = Bun.file(path.join(STATIC_DIR, "auth.css"));
const AUTH_FORMS_JS = Bun.file(path.join(STATIC_DIR, "auth-forms.js"));

type FormFields = Record<string, string>;

function htmlResponse(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status, headers });
}

function problemToFieldErrors(res: Response): { field: string; message: string }[] {
  return [{ field: "_form", message: "Request failed. Check your input and try again." }];
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
  return problemToFieldErrors(res);
}

function renderSetupForm(csrfToken: string, values: FormFields = {}, errors: { field: string; message: string }[] = []): string {
  const v = (key: string) => values[key] ?? "";
  const body = `
    <form method="post" action="/auth/setup" class="auth-card" data-validate hx-post="/auth/setup" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Initial setup</h2>
      ${formErrorsSummary(errors)}
      ${renderAuthField({
        id: "organizationName",
        name: "organizationName",
        label: "Organization name",
        value: v("organizationName"),
        required: true,
        autocomplete: "organization",
        hint: "Creates your default tenant and platform name.",
        error: fieldErrorFor(errors, "organizationName"),
        msgRequired: "Enter your organization name",
      })}
      ${renderAuthField({
        id: "name",
        name: "name",
        label: "Your name",
        value: v("name"),
        required: true,
        autocomplete: "name",
        error: fieldErrorFor(errors, "name"),
        msgRequired: "Enter your name",
      })}
      ${renderAuthField({
        id: "email",
        name: "email",
        label: "Email",
        type: "email",
        value: v("email"),
        required: true,
        autocomplete: "email",
        error: fieldErrorFor(errors, "email"),
        msgRequired: "Enter your email address",
        msgEmail: "Enter an email address like name@example.com",
      })}
      ${renderPasswordField({
        value: v("password"),
        autocomplete: "new-password",
        context: { email: v("email"), name: v("name") },
        attempted: fieldErrorMessages(errors, "password").length > 0,
        failedLabels: fieldErrorMessages(errors, "password"),
      })}
      ${renderAuthField({
        id: "passwordConfirm",
        name: "passwordConfirm",
        label: "Confirm password",
        type: "password",
        value: v("passwordConfirm"),
        required: true,
        autocomplete: "new-password",
        error: fieldErrorFor(errors, "passwordConfirm"),
        msgRequired: "Enter your password again to confirm it",
        msgMatch: "Enter the same password in both fields",
        matchSelector: "#password",
      })}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      <div class="auth-actions">
        <button type="submit" class="auth-button">Complete setup</button>
      </div>
    </form>`;

  return renderAuthPage({
    title: "Platform setup",
    description: "Create your organization and super admin account",
    csrfToken,
    body,
  });
}

function renderLoginForm(
  csrfToken: string,
  values: FormFields = {},
  errors: { field: string; message: string }[] = [],
  flash?: Flash,
  returnTo?: string,
): string {
  const v = (key: string) => values[key] ?? "";
  const body = `
    <form method="post" action="/auth/login" class="auth-card" data-validate hx-post="/auth/login" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Sign in</h2>
      ${formErrorsSummary(errors)}
      ${renderAuthField({
        id: "email",
        name: "email",
        label: "Email",
        type: "email",
        value: v("email"),
        required: true,
        autocomplete: "username",
        error: fieldErrorFor(errors, "email"),
        msgRequired: "Enter your email address",
        msgEmail: "Enter an email address like name@example.com",
      })}
      ${renderAuthField({
        id: "password",
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        autocomplete: "current-password",
        error: fieldErrorFor(errors, "password"),
        msgRequired: "Enter your password",
      })}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      ${returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />` : ""}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Sign in</button>
        <a class="auth-link" href="/auth/forgot-password">Forgot password?</a>
      </div>
    </form>`;

  return renderAuthPage({
    title: "Sign in",
    description: "Authenticate to your z0-auth platform",
    csrfToken,
    body,
    flash,
  });
}

function renderStaticMessagePage(title: string, description: string, csrfToken: string, cardBody: string): string {
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card"><h2>${escapeHtml(title)}</h2>${cardBody}</div>`,
  });
}

async function getSetupPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "setup");
  if (redirect) return redirect;

  const { token, setCookie } = preparePageCsrf(req);
  return withSetCookie(htmlResponse(renderSetupForm(token)), 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
}

async function postSetupPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "setup");
  if (redirect) return redirect;

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return withSetCookie(htmlResponse(renderSetupForm(token, form, errors), 403), setCookie);
  }

  const body: SetupRequest = {
    name: form.name ?? "",
    email: form.email ?? "",
    organizationName: form.organizationName ?? "",
    password: form.password ?? "",
    passwordConfirm: form.passwordConfirm ?? "",
  };

  const result = await runSetup(req, body);
  if (!result.ok) {
    const errors = await problemFieldErrors(result.response);
    const { token, setCookie } = preparePageCsrf(req);
    return withSetCookie(htmlResponse(renderSetupForm(token, form, errors), 400), setCookie);
  }

  const org = encodeURIComponent(result.response.organizationName);
  const location = `/auth/login?setup=complete&org=${org}`;
  return Response.redirect(new URL(location, req.url), 303);
}

async function getLoginPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "login");
  if (redirect) return redirect;

  const url = new URL(req.url);
  let flash: Flash | undefined;
  const returnTo = url.searchParams.get("return_to") ?? undefined;
  if (url.searchParams.get("setup") === "complete") {
    const org = url.searchParams.get("org");
    flash = {
      variant: "success",
      message: org
        ? `Setup complete for ${decodeURIComponent(org)}. Sign in with your super admin account.`
        : "Setup complete. Sign in with your super admin account.",
    };
  }

  const { token, setCookie } = preparePageCsrf(req);
  return withSetCookie(
    htmlResponse(renderLoginForm(token, {}, [], flash, returnTo)),
    200,
    setCookie ? { "Set-Cookie": setCookie } : undefined,
  );
}

async function postLoginPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "login");
  if (redirect) return redirect;

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return withSetCookie(htmlResponse(renderLoginForm(token, form, errors, undefined, form.return_to), 403), setCookie);
  }

  const result = await runLogin(req, form.email ?? "", form.password ?? "");
  if (!result.ok) {
    const errors = result.fieldErrors ?? (await problemFieldErrors(result.response));
    const { token, setCookie } = preparePageCsrf(req);
    const status = result.response.status === 401 ? 401 : 400;
    return withSetCookie(htmlResponse(renderLoginForm(token, form, errors, undefined, form.return_to), status), setCookie);
  }

  const hasOauthReturn = parseCookies(req).has("z0_oauth_return");
  const location = form.return_to || (hasOauthReturn ? "/oauth/resume" : "/");
  const headers = new Headers({ Location: location.startsWith("/") ? location : "/" });
  headers.set("Set-Cookie", result.setCookie);
  return new Response(null, { status: 303, headers });
}

async function getForgotPasswordPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "forgot-password");
  if (redirect) return redirect;

  const { token, setCookie } = preparePageCsrf(req);
  const html = renderStaticMessagePage(
    "Reset password",
    "Email-based reset will be available when SMTP is configured.",
    token,
    `<p class="auth-footer">Self-service password reset is not enabled. Contact your platform operator if you are locked out.</p>
     <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
  );
  return withSetCookie(htmlResponse(html), 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
}

async function getRegisterPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "register");
  if (redirect) return redirect;

  const { token, setCookie } = preparePageCsrf(req);
  const html = renderStaticMessagePage(
    "Registration",
    "Public registration is disabled on this platform.",
    token,
    `<p class="auth-footer">Accounts are created by your platform administrator.</p>
     <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
  );
  return withSetCookie(htmlResponse(html), 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
}

async function getHomePage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "home");
  if (redirect) return redirect;

  const session = await buildSessionResponse(req);
  const email = session.user?.email ?? "unknown";
  const { token, setCookie } = preparePageCsrf(req);

  const body = `
    <div class="auth-card">
      <h2>Signed in</h2>
      <p class="auth-footer">You are authenticated as <strong>${escapeHtml(email)}</strong>.</p>
      <form method="post" action="/auth/logout" class="auth-actions">
        <input type="hidden" name="_csrf" value="${escapeHtml(token)}" />
        <button type="submit" class="auth-button">Sign out</button>
      </form>
    </div>`;

  const html = renderAuthPage({
    title: "Platform",
    description: "Session active",
    csrfToken: token,
    body,
  });

  return withSetCookie(htmlResponse(html), 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
}

async function postLogoutPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) return Response.redirect(new URL("/auth/login", req.url), 303);

  const token = parseCookies(req).get(SESSION_COOKIE);
  if (token) await revokeSessionByToken(token);

  const headers = new Headers({ Location: "/auth/login" });
  headers.set("Set-Cookie", clearSessionCookieHeader());
  return new Response(null, { status: 303, headers });
}

async function serveAuthCss(): Promise<Response> {
  return new Response(AUTH_CSS, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

async function serveAuthFormsJs(): Promise<Response> {
  return new Response(AUTH_FORMS_JS, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

export const authWebRoutes = {
  "/auth/setup": {
    GET: getSetupPage,
    POST: postSetupPage,
  },
  "/auth/login": {
    GET: getLoginPage,
    POST: postLoginPage,
  },
  "/auth/register": {
    GET: getRegisterPage,
  },
  "/auth/forgot-password": {
    GET: getForgotPasswordPage,
  },
  "/auth/logout": {
    POST: postLogoutPage,
  },
  "/static/auth.css": {
    GET: serveAuthCss,
  },
  "/static/auth-forms.js": {
    GET: serveAuthFormsJs,
  },
} as const;
