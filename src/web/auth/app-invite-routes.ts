import type { BunRequest } from "bun";

import type { AppUserInvitePreviewResponse } from "@z0/contracts/app-users";

import { runAppInviteAcceptSignIn, runAppLogin } from "../../api/lib/app-auth";
import { findActiveClientIdForApp } from "../../api/lib/auth-realm";
import {
  acceptAppUserInvite,
  buildAppUserInvitePreview,
  declineAppUserInvite,
} from "../../api/lib/app-users";
import { validateFormCsrf } from "../../api/lib/csrf";
import { parseCookies } from "../../api/lib/csrf";
import { authFormErrorStatus, htmxAuthErrorHeaders, htmlFormRedirect } from "../htmx";
import { parseFormBody } from "../forms";
import {
  escapeHtml,
  fieldErrorFor,
  fieldErrorMessages,
  formErrorsSummary,
  renderAuthField,
  renderAuthPage,
  renderPasswordField,
} from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";
import { renderLoginForm } from "./routes";

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
    const body = (await res.json()) as { errors?: { field: string; message: string }[]; detail?: string };
    if (body.errors?.length) return body.errors.map((e) => ({ field: e.field, message: e.message }));
    if (body.detail) return [{ field: "_form", message: body.detail }];
  } catch {
    /* ignore */
  }
  return [{ field: "_form", message: "Request failed. Try again." }];
}

function inviteTokenFrom(req: BunRequest): string | null {
  const match = new URL(req.url).pathname.match(/^\/auth\/app-invite\/([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

function inviteReturnPath(token: string): string {
  return `/auth/app-invite/${token}`;
}

function renderInviteStatusPage(csrfToken: string, title: string, message: string, preview?: AppUserInvitePreviewResponse): string {
  const app = preview ? `<p class="auth-footer">Application: <strong>${escapeHtml(preview.appName)}</strong></p>` : "";
  return renderAuthPage({
    title,
    description: "Application invitation",
    csrfToken,
    body: `
      <div class="auth-card">
        <h2>${escapeHtml(title)}</h2>
        <p class="auth-footer">${escapeHtml(message)}</p>
        ${app}
      </div>`,
  });
}

function renderNewUserAccept(
  csrfToken: string,
  preview: AppUserInvitePreviewResponse,
  token: string,
  values: Record<string, string> = {},
  errors: { field: string; message: string }[] = [],
): string {
  const v = (key: string) => values[key] ?? preview.invitedName ?? "";
  return renderAuthPage({
    title: "Join application",
    description: `Invitation for ${preview.email}`,
    csrfToken,
    body: `
      <form method="post" action="${escapeHtml(inviteReturnPath(token))}" class="auth-card" data-validate>
        <h2>Join ${escapeHtml(preview.appName)}</h2>
        <p class="auth-footer">Set a password for <strong>${escapeHtml(preview.email)}</strong>.</p>
        ${formErrorsSummary(errors)}
        <input type="hidden" name="intent" value="accept" />
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
        ${renderPasswordField({
          value: v("password"),
          autocomplete: "new-password",
          context: { email: preview.email, name: v("name") },
          attempted: errors.some((e) => e.field === "password"),
          failedLabels: errors.filter((e) => e.field === "password").map((e) => e.message),
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
          msgRequired: "Confirm your password",
          msgMatch: "Passwords must match",
          matchSelector: "#password",
        })}
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <div class="auth-actions">
          <button type="submit" class="auth-button">Accept and create account</button>
        </div>
      </form>`,
  });
}

async function loadPreview(req: BunRequest, token: string): Promise<AppUserInvitePreviewResponse | Response> {
  const result = await buildAppUserInvitePreview(req, token);
  if (result instanceof Response) return result;
  return result;
}

async function loginFormForExistingAccount(
  csrfToken: string,
  preview: AppUserInvitePreviewResponse,
  token: string,
): Promise<string> {
  const clientId = await findActiveClientIdForApp(preview.appId);
  if (!clientId) {
    return renderInviteStatusPage(
      csrfToken,
      "Sign-in unavailable",
      "This application does not have active credentials for sign-in.",
      preview,
    );
  }

  return renderLoginForm(
    csrfToken,
    { email: preview.email },
    [],
    {
      variant: "success",
      message: `Sign in as ${preview.email} to access ${preview.appName}.`,
    },
    inviteReturnPath(token),
    { clientId, appName: preview.appName },
  );
}

export async function getAppInvitePage(req: BunRequest): Promise<Response> {
  const token = inviteTokenFrom(req);
  if (!token) return new Response("Not found", { status: 404 });

  const preview = await loadPreview(req, token);
  if (preview instanceof Response) {
    const { token: csrf, setCookie } = preparePageCsrf(req);
    return withSetCookie(
      htmlResponse(renderInviteStatusPage(csrf, "Invalid invitation", "This link is not valid.")),
      setCookie,
    );
  }

  const { token: csrf, setCookie } = preparePageCsrf(req);

  if (preview.status !== "pending") {
    const titles: Record<string, string> = {
      expired: "Invitation expired",
      accepted: "Invitation already accepted",
      declined: "Invitation declined",
      revoked: "Invitation revoked",
    };
    const messages: Record<string, string> = {
      expired: "Ask the application owner to send a new invitation.",
      accepted: "You can sign in to this application.",
      declined: "This invitation was declined.",
      revoked: "This invitation is no longer valid.",
    };
    return withSetCookie(
      htmlResponse(
        renderInviteStatusPage(csrf, titles[preview.status] ?? "Invitation unavailable", messages[preview.status] ?? "", preview),
      ),
      setCookie,
    );
  }

  if (preview.accountExists) {
    return withSetCookie(htmlResponse(await loginFormForExistingAccount(csrf, preview, token)), setCookie);
  }

  return withSetCookie(htmlResponse(renderNewUserAccept(csrf, preview, token)), setCookie);
}

export async function postAppInvitePage(req: BunRequest): Promise<Response> {
  const token = inviteTokenFrom(req);
  if (!token) return new Response("Not found", { status: 404 });

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const preview = await loadPreview(req, token);
    if (preview instanceof Response) return preview;
    const { token: csrf, setCookie } = preparePageCsrf(req);
    const html = preview.accountExists
      ? await loginFormForExistingAccount(csrf, preview, token)
      : renderNewUserAccept(csrf, preview, token, form, errors);
    return authErrorResponse(html, req, 403, setCookie);
  }

  const intent = form.intent ?? "accept";

  if (intent === "login") {
    const preview = await loadPreview(req, token);
    if (preview instanceof Response) return preview;
    const clientId = await findActiveClientIdForApp(preview.appId);
    if (!clientId) {
      const { token: csrf, setCookie } = preparePageCsrf(req);
      return withSetCookie(
        htmlResponse(
          renderInviteStatusPage(csrf, "Sign-in unavailable", "This application is not available for sign-in.", preview),
        ),
        setCookie,
      );
    }

    const result = await runAppLogin(req, preview.appId, form.email ?? "", form.password ?? "", inviteReturnPath(token));
    const { token: csrf, setCookie } = preparePageCsrf(req);
    if (!result.ok) {
      const errors = result.fieldErrors ?? (await problemFieldErrors(result.response));
      return authErrorResponse(
        renderLoginForm(csrf, form, errors, undefined, inviteReturnPath(token), {
          clientId,
          appName: preview.appName,
        }),
        req,
        401,
        setCookie,
      );
    }

    if (result.mfaRequired) {
      return htmlFormRedirect(req, "/auth/mfa", { setCookie: result.setCookie });
    }

    const location = parseCookies(req).has("z0_oauth_return") ? "/oauth/resume" : inviteReturnPath(token);
    return htmlFormRedirect(req, location, {
      setCookie: result.setCookie,
      setCookies: result.rememberedBrowserCookie ? [result.rememberedBrowserCookie] : undefined,
    });
  }

  const preview = await loadPreview(req, token);
  if (preview instanceof Response) return preview;

  if (intent === "decline") {
    const result = await declineAppUserInvite(req, token);
    if (!result.ok) {
      const errors = await problemFieldErrors(result.response);
      const { token: csrf, setCookie } = preparePageCsrf(req);
      return authErrorResponse(renderNewUserAccept(csrf, preview, token, form, errors), req, 400, setCookie);
    }
    const { token: csrf, setCookie } = preparePageCsrf(req);
    return withSetCookie(
      htmlResponse(renderInviteStatusPage(csrf, "Invitation declined", "You will not be added to this application.", preview)),
      setCookie,
    );
  }

  const acceptResult = await acceptAppUserInvite(req, token, {
    name: form.name,
    password: form.password,
    passwordConfirm: form.passwordConfirm,
  });

  if (!acceptResult.ok) {
    const errors = await problemFieldErrors(acceptResult.response);
    const { token: csrf, setCookie } = preparePageCsrf(req);
    const html = preview.accountExists
      ? await loginFormForExistingAccount(csrf, preview, token)
      : renderNewUserAccept(csrf, preview, token, form, errors);
    const status = acceptResult.response.status === 409 ? 409 : 400;
    return authErrorResponse(html, req, status, setCookie);
  }

  const signIn = await runAppInviteAcceptSignIn(req, preview.appId, acceptResult.userId, inviteReturnPath(token));
  if (signIn.mfaRequired) {
    return htmlFormRedirect(req, "/auth/mfa", { setCookie: signIn.setCookie });
  }
  const location = parseCookies(req).has("z0_oauth_return") ? "/oauth/resume" : inviteReturnPath(token);
  return htmlFormRedirect(req, location, { setCookie: signIn.setCookie });
}

export const appInviteWebRoutes = {
  "/auth/app-invite/:token": {
    GET: getAppInvitePage,
    POST: postAppInvitePage,
  },
} as const;
