import type { BunRequest } from "bun";

import type { InvitePreviewResponse } from "@z0/contracts/invites";

import { runLogin } from "../../api/auth/service";
import { acceptInstanceInvite, buildInvitePreview, declineInstanceInvite } from "../../api/lib/invites";
import { validateFormCsrf } from "../../api/lib/csrf";
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
  const match = new URL(req.url).pathname.match(/^\/auth\/invite\/([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

function inviteReturnPath(token: string): string {
  return `/auth/invite/${token}`;
}

function renderInviteStatusPage(
  csrfToken: string,
  title: string,
  message: string,
  preview?: InvitePreviewResponse,
): string {
  const org = preview ? `<p class="auth-footer">Organization: <strong>${escapeHtml(preview.organizationName)}</strong></p>` : "";
  return renderAuthPage({
    title,
    description: "Organization invitation",
    csrfToken,
    body: `
      <div class="auth-card">
        <h2>${escapeHtml(title)}</h2>
        <p class="auth-footer">${escapeHtml(message)}</p>
        ${org}
        <div class="auth-actions"><a class="auth-button" href="/auth/login">Go to sign in</a></div>
      </div>`,
  });
}

function renderExistingUserInvite(
  csrfToken: string,
  preview: InvitePreviewResponse,
  token: string,
  errors: { field: string; message: string }[] = [],
): string {
  return renderAuthPage({
    title: "Join organization",
    description: `Invitation for ${preview.email}`,
    csrfToken,
    body: `
      <div class="auth-card">
        <h2>Join ${escapeHtml(preview.organizationName)}</h2>
        <p class="auth-footer">
          Signed in as <strong>${escapeHtml(preview.viewer.email ?? "")}</strong>.
          You were invited to join this organization as a member.
        </p>
        ${formErrorsSummary(errors)}
        <form method="post" action="${escapeHtml(inviteReturnPath(token))}" class="auth-actions" style="display:flex;gap:0.75rem;flex-wrap:wrap">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <input type="hidden" name="intent" value="accept" />
          <button type="submit" class="auth-button">Accept invitation</button>
        </form>
        <form method="post" action="${escapeHtml(inviteReturnPath(token))}" class="auth-actions" style="margin-top:0.5rem">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <input type="hidden" name="intent" value="decline" />
          <button type="submit" class="auth-button auth-button-secondary">Decline</button>
        </form>
      </div>`,
  });
}

function renderLoginToAccept(csrfToken: string, preview: InvitePreviewResponse, token: string): string {
  const returnTo = inviteReturnPath(token);
  const loginForm = renderLoginForm(
    csrfToken,
    { email: preview.email },
    [],
    {
      variant: "success",
      message: `Sign in as ${preview.email} to accept or decline this invitation.`,
    },
    returnTo,
  );
  return loginForm;
}

function renderWrongAccount(csrfToken: string, preview: InvitePreviewResponse, token: string): string {
  return renderAuthPage({
    title: "Wrong account",
    description: "Invitation email mismatch",
    csrfToken,
    body: `
      <div class="auth-card">
        <h2>Wrong account</h2>
        <p class="auth-footer">
          This invitation was sent to <strong>${escapeHtml(preview.email)}</strong>.
          You are signed in as <strong>${escapeHtml(preview.viewer.email ?? "")}</strong>.
        </p>
        <p class="auth-footer">Sign out and sign in with the invited email to continue.</p>
        <form method="post" action="/auth/logout" class="auth-actions" style="display:inline">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <button type="submit" class="auth-button">Sign out</button>
        </form>
        <a class="auth-button" href="${escapeHtml(inviteReturnPath(token))}" style="margin-left:0.5rem">Try again</a>
      </div>`,
  });
}

function renderNewUserAccept(
  csrfToken: string,
  preview: InvitePreviewResponse,
  token: string,
  values: Record<string, string> = {},
  errors: { field: string; message: string }[] = [],
): string {
  const v = (key: string) => values[key] ?? preview.invitedName ?? "";
  return renderAuthPage({
    title: "Create your account",
    description: `Join ${preview.organizationName}`,
    csrfToken,
    body: `
      <form method="post" action="${escapeHtml(inviteReturnPath(token))}" class="auth-card" data-validate>
        <h2>Join ${escapeHtml(preview.organizationName)}</h2>
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

async function loadPreview(req: BunRequest, token: string): Promise<InvitePreviewResponse | Response> {
  const result = await buildInvitePreview(req, token);
  if (result instanceof Response) return result;
  return result;
}

export async function getInvitePage(req: BunRequest): Promise<Response> {
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
      expired: "Ask your administrator to send a new invitation.",
      accepted: "You can sign in to access the organization.",
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
    if (!preview.viewer.authenticated) {
      return withSetCookie(htmlResponse(renderLoginToAccept(csrf, preview, token)), setCookie);
    }
    if (!preview.viewer.emailMatches) {
      return withSetCookie(htmlResponse(renderWrongAccount(csrf, preview, token)), setCookie);
    }
    return withSetCookie(htmlResponse(renderExistingUserInvite(csrf, preview, token)), setCookie);
  }

  return withSetCookie(htmlResponse(renderNewUserAccept(csrf, preview, token)), setCookie);
}

export async function postInvitePage(req: BunRequest): Promise<Response> {
  const token = inviteTokenFrom(req);
  if (!token) return new Response("Not found", { status: 404 });

  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const errors = await problemFieldErrors(csrfError);
    const preview = await loadPreview(req, token);
    if (preview instanceof Response) return preview;
    const { token: csrf, setCookie } = preparePageCsrf(req);
    const html =
      preview.accountExists && preview.viewer.emailMatches
        ? renderExistingUserInvite(csrf, preview, token, errors)
        : renderNewUserAccept(csrf, preview, token, form, errors);
    return authErrorResponse(html, req, 403, setCookie);
  }

  const intent = form.intent ?? "accept";

  if (intent === "login") {
    const result = await runLogin(req, form.email ?? "", form.password ?? "");
    const preview = await loadPreview(req, token);
    if (preview instanceof Response) return preview;
    const { token: csrf, setCookie } = preparePageCsrf(req);
    if (!result.ok) {
      const errors = result.fieldErrors ?? (await problemFieldErrors(result.response));
      return authErrorResponse(
        renderLoginForm(csrf, form, errors, undefined, inviteReturnPath(token)),
        req,
        401,
        setCookie,
      );
    }
    const headers = new Headers({ Location: inviteReturnPath(token) });
    headers.set("Set-Cookie", result.setCookie);
    return new Response(null, { status: 303, headers });
  }

  if (intent === "decline") {
    const result = await declineInstanceInvite(req, token);
    if (!result.ok) {
      const errors = await problemFieldErrors(result.response);
      const preview = await loadPreview(req, token);
      if (preview instanceof Response) return preview;
      const { token: csrf, setCookie } = preparePageCsrf(req);
      return authErrorResponse(renderExistingUserInvite(csrf, preview, token, errors), req, 400, setCookie);
    }
    const { token: csrf, setCookie } = preparePageCsrf(req);
    return withSetCookie(
      htmlResponse(
        renderInviteStatusPage(csrf, "Invitation declined", "You will not be added to this organization."),
      ),
      setCookie,
    );
  }

  const acceptResult = await acceptInstanceInvite(req, token, {
    name: form.name,
    password: form.password,
    passwordConfirm: form.passwordConfirm,
  });

  if (!acceptResult.ok) {
    const errors = await problemFieldErrors(acceptResult.response);
    const preview = await loadPreview(req, token);
    if (preview instanceof Response) return preview;
    const { token: csrf, setCookie } = preparePageCsrf(req);
    const html = preview.accountExists
      ? renderExistingUserInvite(csrf, preview, token, errors)
      : renderNewUserAccept(csrf, preview, token, form, errors);
    const status = acceptResult.response.status === 401 ? 401 : 400;
    return authErrorResponse(html, req, status, setCookie);
  }

  const headers = new Headers({ Location: "/" });
  if (acceptResult.setCookie) headers.append("Set-Cookie", acceptResult.setCookie);
  return new Response(null, { status: 303, headers });
}

/** Dynamic invite paths for Bun route table. */
export const inviteWebRoutes = {
  "/auth/invite/:token": {
    GET: getInvitePage,
    POST: postInvitePage,
  },
} as const;
