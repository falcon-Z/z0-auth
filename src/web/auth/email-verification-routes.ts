import type { BunRequest } from "bun";

import {
  completeAppEmailVerification,
  GENERIC_VERIFICATION_MESSAGE,
  previewAppEmailVerification,
  requestAppEmailVerification,
} from "../../api/lib/app-email-verification";
import { validateFormCsrf } from "../../api/lib/csrf";
import { parseFormBody } from "../forms";
import { escapeHtml, renderAuthField, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function outcomePage(csrfToken: string, title: string, description: string): string {
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card"><div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div></div>`,
  });
}

function confirmPage(csrfToken: string, rawToken: string, appName: string): string {
  return renderAuthPage({
    title: "Verify your email",
    description: `Confirm your email for ${escapeHtml(appName)}.`,
    csrfToken,
    body: `<form method="post" action="/auth/verify-email/${encodeURIComponent(rawToken)}/accept" class="auth-card">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      <div class="auth-actions"><button type="submit" class="auth-button">Verify email</button></div>
    </form>`,
  });
}

async function getVerificationPage(req: BunRequest): Promise<Response> {
  const match = new URL(req.url).pathname.match(/^\/auth\/verify-email\/([^/]+)$/);
  const rawToken = match?.[1] ? decodeURIComponent(match[1]) : "";
  const preview = await previewAppEmailVerification(rawToken);
  const { token, setCookie } = preparePageCsrf(req);
  const html = preview.valid
    ? confirmPage(token, rawToken, preview.appName ?? "this application")
    : outcomePage(token, "Verification link expired", "This verification link is invalid or has expired. Request a new email and try again.");
  return withSetCookie(htmlResponse(html), setCookie);
}

async function postVerificationPage(req: BunRequest): Promise<Response> {
  const match = new URL(req.url).pathname.match(/^\/auth\/verify-email\/([^/]+)\/accept$/);
  const rawToken = match?.[1] ? decodeURIComponent(match[1]) : "";
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  const { token, setCookie } = preparePageCsrf(req);
  if (csrfError) return withSetCookie(htmlResponse(confirmPage(token, rawToken, "this application"), 403), setCookie);
  const result = await completeAppEmailVerification(rawToken);
  const html = result.ok
    ? outcomePage(token, "Email verified", `Your email is verified for ${escapeHtml(result.appName)}.`)
    : outcomePage(token, "Verification link expired", "This verification link is invalid or has expired. Request a new email and try again.");
  return withSetCookie(htmlResponse(html), setCookie);
}

function resendPage(csrfToken: string, values: { clientId?: string; email?: string } = {}, sent = false): string {
  return renderAuthPage({
    title: "Verify your email",
    description: sent ? GENERIC_VERIFICATION_MESSAGE : "Request a new verification link for an application account.",
    csrfToken,
    body: sent
      ? `<div class="auth-card"><div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div></div>`
      : `<form method="post" action="/auth/verify-email" class="auth-card">
        ${renderAuthField({ id: "clientId", name: "client_id", label: "Application client ID", value: values.clientId ?? "", required: true })}
        ${renderAuthField({ id: "email", name: "email", label: "Email", type: "email", value: values.email ?? "", required: true, autocomplete: "email" })}
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <div class="auth-actions"><button type="submit" class="auth-button">Send verification email</button></div>
      </form>`,
  });
}

async function getResendPage(req: BunRequest): Promise<Response> {
  const { token, setCookie } = preparePageCsrf(req);
  const url = new URL(req.url);
  return withSetCookie(htmlResponse(resendPage(token, { clientId: url.searchParams.get("client_id") ?? undefined })), setCookie);
}

async function postResendPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const { token, setCookie } = preparePageCsrf(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) return withSetCookie(htmlResponse(resendPage(token, { clientId: form.client_id, email: form.email }), 403), setCookie);
  const response = await requestAppEmailVerification(req, form.client_id ?? "", form.email ?? "");
  if (response.status === 429) return response;
  return withSetCookie(htmlResponse(resendPage(token, {}, true)), setCookie);
}

export const emailVerificationWebRoutes = {
  "/auth/verify-email": { GET: getResendPage, POST: postResendPage },
  "/auth/verify-email/:token": { GET: getVerificationPage },
  "/auth/verify-email/:token/accept": { POST: postVerificationPage },
} as const;
