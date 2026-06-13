import type { BunRequest } from "bun";
import path from "node:path";

import type { SetupRequest } from "@z0/contracts/setup";
import { runLogin } from "../../api/auth/service";
import { runAppLogin, runAppRegister } from "../../api/lib/app-auth";
import type { AppAuthRealm, AuthRealm } from "../../api/lib/auth-realm";
import { resolveAuthRealm } from "../../api/lib/auth-realm";
import { buildSessionResponse } from "../../api/lib/auth";
import { validateFormCsrf } from "../../api/lib/csrf";
import { clearSessionCookieHeader, revokeSessionByToken, SESSION_COOKIE } from "../../api/lib/session";
import { parseCookies } from "../../api/lib/csrf";
import { runSetup } from "../../api/setup/service";
import { checkDatabaseSchema } from "../../api/lib/db";
import { loadConfig } from "../../api/lib/config";
import { redirectForAuthPage } from "../ui-guard";
import { authFormErrorStatus, htmlFormRedirect, htmxAuthErrorHeaders } from "../htmx";
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
import { safeReturnPath } from "../safe-return-path";

const STATIC_DIR = path.join(import.meta.dir, "../static");
const AUTH_CSS = Bun.file(path.join(STATIC_DIR, "auth.css"));
const AUTH_FORMS_JS = Bun.file(path.join(STATIC_DIR, "auth-forms.js"));

type FormFields = Record<string, string>;

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

type SetupFormOptions = {
  installTokenRequired: boolean;
};

function renderSetupSchemaBlocked(csrfToken: string): string {
  return renderAuthPage({
    title: "Database not ready",
    description: "Apply migrations before creating your account.",
    csrfToken,
    body: `<div class="auth-card">
      <h2>Run database migrations</h2>
      <p class="auth-lead">PostgreSQL is reachable, but this instance does not have the required tables yet.</p>
      <p>From a machine that can reach <code>DATABASE_URL</code>, run:</p>
      <p><code>bun run db:migrate</code></p>
      <p>Then reload this page to continue setup.</p>
    </div>`,
  });
}

function renderSetupForm(
  csrfToken: string,
  values: FormFields = {},
  errors: { field: string; message: string }[] = [],
  options: SetupFormOptions = { installTokenRequired: false },
): string {
  const v = (key: string) => values[key] ?? "";
  const installTokenField = options.installTokenRequired
    ? renderAuthField({
        id: "installToken",
        name: "installToken",
        label: "Install token",
        type: "password",
        value: v("installToken"),
        required: true,
        autocomplete: "off",
        hint: "Required because INSTALL_TOKEN is set on this server.",
        error: fieldErrorFor(errors, "_install") ?? fieldErrorFor(errors, "installToken"),
        msgRequired: "Enter the install token from your deployment configuration",
      })
    : "";
  const body = `
    <form method="post" action="/auth/setup" class="auth-card" data-validate hx-post="/auth/setup" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Create your account</h2>
      ${formErrorsSummary(errors)}
      ${installTokenField}
      ${renderAuthField({
        id: "organizationName",
        name: "organizationName",
        label: "Organization name",
        value: v("organizationName"),
        required: true,
        autocomplete: "organization",
        hint: "Shown in the console and on invitations.",
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
    title: "Create account",
    description: "Set up your organization and the first console account for this instance.",
    csrfToken,
    body,
  });
}

type AppLoginContext = Pick<AppAuthRealm, "clientId" | "appName">;

function registerHref(clientId: string, returnTo?: string): string {
  const params = new URLSearchParams({ client_id: clientId });
  if (returnTo) params.set("return_to", returnTo);
  return `/auth/register?${params.toString()}`;
}

export function renderLoginForm(
  csrfToken: string,
  values: FormFields = {},
  errors: { field: string; message: string }[] = [],
  flash?: Flash,
  returnTo?: string,
  app?: AppLoginContext,
): string {
  const v = (key: string) => values[key] ?? "";
  const forgotLink = app
    ? ""
    : `<a class="auth-link" href="/auth/forgot-password">Forgot password?</a>`;
  const registerLink = app
    ? `<a class="auth-link" href="${escapeHtml(registerHref(app.clientId, returnTo))}">Create account</a>`
    : "";
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
      ${app ? `<input type="hidden" name="client_id" value="${escapeHtml(app.clientId)}" />` : ""}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Sign in</button>
        ${forgotLink}
        ${registerLink}
      </div>
    </form>`;

  return renderAuthPage({
    title: "Sign in",
    description: app ? `Sign in to ${app.appName}.` : "Sign in to the console for this instance.",
    csrfToken,
    body,
    flash,
  });
}

function renderInvalidClientPage(csrfToken: string, message: string): string {
  return renderAuthPage({
    title: "Sign-in unavailable",
    description: message,
    csrfToken,
    body: `
      <div class="auth-card">
        <h2>Sign-in unavailable</h2>
        <p class="auth-footer">${escapeHtml(message)}</p>
      </div>`,
  });
}

function renderAppRegisterForm(
  csrfToken: string,
  app: AppLoginContext,
  values: FormFields = {},
  errors: { field: string; message: string }[] = [],
  returnTo?: string,
): string {
  const v = (key: string) => values[key] ?? "";
  const loginHref = (() => {
    const params = new URLSearchParams({ client_id: app.clientId });
    if (returnTo) params.set("return_to", returnTo);
    return `/auth/login?${params.toString()}`;
  })();

  const body = `
    <form method="post" action="/auth/register" class="auth-card" data-validate hx-post="/auth/register" hx-target="#auth-root" hx-select="#auth-root" hx-swap="outerHTML">
      <h2>Create account</h2>
      ${formErrorsSummary(errors)}
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
      <input type="hidden" name="client_id" value="${escapeHtml(app.clientId)}" />
      ${returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />` : ""}
      <div class="auth-actions">
        <button type="submit" class="auth-button">Create account</button>
        <a class="auth-link" href="${escapeHtml(loginHref)}">Already have an account?</a>
      </div>
    </form>`;

  return renderAuthPage({
    title: "Create account",
    description: `Sign up for ${app.appName}.`,
    csrfToken,
    body,
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

  const schema = await checkDatabaseSchema();
  const config = loadConfig();
  const { token, setCookie } = preparePageCsrf(req);
  if (!schema.ready) {
    return withSetCookie(htmlResponse(renderSetupSchemaBlocked(token)), setCookie);
  }
  return withSetCookie(
    htmlResponse(renderSetupForm(token, {}, [], { installTokenRequired: Boolean(config.installToken) })),
    setCookie,
  );
}

async function postSetupPage(req: BunRequest): Promise<Response> {
  const redirect = await redirectForAuthPage(req, "setup");
  if (redirect) return redirect;

  const config = loadConfig();
  const formOptions = { installTokenRequired: Boolean(config.installToken) };

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(renderSetupForm(token, form, errors, formOptions), req, 403, setCookie);
  }

  const body: SetupRequest = {
    name: form.name ?? "",
    email: form.email ?? "",
    organizationName: form.organizationName ?? "",
    password: form.password ?? "",
    passwordConfirm: form.passwordConfirm ?? "",
  };

  const result = await runSetup(req, body, { installToken: form.installToken });
  if (!result.ok) {
    const errors = await problemFieldErrors(result.response);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderSetupForm(token, form, errors, formOptions),
      req,
      result.response.status,
      setCookie,
    );
  }

  const org = encodeURIComponent(result.response.organizationName);
  const location = `/auth/login?setup=complete&org=${org}`;
  return htmlFormRedirect(req, location);
}

function appContextFromRealm(realm: AuthRealm): AppLoginContext | undefined {
  return realm.mode === "app"
    ? { clientId: realm.clientId, appName: realm.appName }
    : undefined;
}

async function getLoginPage(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return_to") ?? undefined;
  const realm = await resolveAuthRealm(req, { returnTo });

  if (realm.mode === "invalid") {
    const { token, setCookie } = preparePageCsrf(req);
    return withSetCookie(htmlResponse(renderInvalidClientPage(token, realm.message)), setCookie);
  }

  const redirect = await redirectForAuthPage(req, "login", realm);
  if (redirect) return redirect;

  let flash: Flash | undefined;
  if (url.searchParams.get("setup") === "complete") {
    const org = url.searchParams.get("org");
    flash = {
      variant: "success",
      message: org
        ? `Setup complete for ${decodeURIComponent(org)}. Sign in with the account you just created.`
        : "Setup complete. Sign in with the account you just created.",
    };
  }

  const { token, setCookie } = preparePageCsrf(req);
  return withSetCookie(
    htmlResponse(renderLoginForm(token, {}, [], flash, returnTo, appContextFromRealm(realm))),
    setCookie,
  );
}

async function postLoginPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const realm = await resolveAuthRealm(req, {
    clientId: form.client_id,
    returnTo: form.return_to,
  });

  if (realm.mode === "invalid") {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(renderInvalidClientPage(token, realm.message), req, 400, setCookie);
  }

  const redirect = await redirectForAuthPage(req, "login", realm);
  if (redirect) return redirect;

  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderLoginForm(token, form, errors, undefined, form.return_to, appContextFromRealm(realm)),
      req,
      403,
      setCookie,
    );
  }

  const app = appContextFromRealm(realm);
  const result =
    realm.mode === "app"
      ? await runAppLogin(req, realm.appId, form.email ?? "", form.password ?? "")
      : await runLogin(req, form.email ?? "", form.password ?? "");

  if (!result.ok) {
    const errors = result.fieldErrors ?? (await problemFieldErrors(result.response));
    const { token, setCookie } = preparePageCsrf(req);
    const fallback = result.response.status === 401 ? 401 : 400;
    return authErrorResponse(
      renderLoginForm(token, form, errors, undefined, form.return_to, app),
      req,
      fallback,
      setCookie,
    );
  }

  const fallback = app || parseCookies(req).has("z0_oauth_return") ? "/oauth/resume" : "/";
  const location = safeReturnPath(form.return_to, fallback);
  return htmlFormRedirect(req, location, { setCookie: result.setCookie });
}

async function getRegisterPage(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return_to") ?? undefined;
  const realm = await resolveAuthRealm(req, { returnTo });

  if (realm.mode === "invalid") {
    const { token, setCookie } = preparePageCsrf(req);
    return withSetCookie(htmlResponse(renderInvalidClientPage(token, realm.message)), setCookie);
  }

  const redirect = await redirectForAuthPage(req, "register", realm);
  if (redirect) return redirect;

  const { token, setCookie } = preparePageCsrf(req);

  if (realm.mode === "app") {
    return withSetCookie(
      htmlResponse(
        renderAppRegisterForm(token, { clientId: realm.clientId, appName: realm.appName }, {}, [], returnTo),
      ),
      setCookie,
    );
  }

  const html = renderStaticMessagePage(
    "Invitation only",
    "New accounts are created through an organization invitation.",
    token,
    `<p class="auth-footer">If you were invited, open the link from your invitation. Otherwise ask an existing team member for an invite.</p>
     <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
  );
  return withSetCookie(htmlResponse(html), setCookie);
}

async function postRegisterPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const realm = await resolveAuthRealm(req, {
    clientId: form.client_id,
    returnTo: form.return_to,
  });

  if (realm.mode !== "app") {
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderStaticMessagePage(
        "Invitation only",
        "Self-registration requires an application sign-in link.",
        token,
        `<div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>`,
      ),
      req,
      400,
      setCookie,
    );
  }

  const redirect = await redirectForAuthPage(req, "register", realm);
  if (redirect) return redirect;

  const csrfError = validateFormCsrf(req, form._csrf);
  const app = { clientId: realm.clientId, appName: realm.appName };
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const { token, setCookie } = preparePageCsrf(req);
    return authErrorResponse(
      renderAppRegisterForm(token, app, form, errors, form.return_to),
      req,
      403,
      setCookie,
    );
  }

  const result = await runAppRegister(
    req,
    realm.appId,
    form.email ?? "",
    form.name ?? "",
    form.password ?? "",
    form.passwordConfirm ?? "",
  );

  if (!result.ok) {
    const errors = result.fieldErrors ?? (await problemFieldErrors(result.response));
    const { token, setCookie } = preparePageCsrf(req);
    const fallback = result.response.status === 409 ? 409 : 400;
    return authErrorResponse(
      renderAppRegisterForm(token, app, form, errors, form.return_to),
      req,
      fallback,
      setCookie,
    );
  }

  const location = safeReturnPath(form.return_to, "/oauth/resume");
  return htmlFormRedirect(req, location, { setCookie: result.setCookie });
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

  return withSetCookie(htmlResponse(html), setCookie);
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
    POST: postRegisterPage,
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
