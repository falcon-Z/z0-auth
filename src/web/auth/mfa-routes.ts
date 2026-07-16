import type { BunRequest } from "bun";

import { validateFormCsrf } from "../../api/lib/csrf";
import { completeMfaSignIn } from "../../api/lib/mfa-completion";
import { resolveMfaChallenge } from "../../api/lib/mfa";
import { parseFormBody } from "../forms";
import { fieldErrorFor, formErrorsSummary, renderAuthField, renderAuthPage } from "../html";
import { preparePageCsrf, withSetCookie } from "../csrf-page";
import { safeReturnPath } from "../safe-return-path";

type FieldError = { field: string; message: string };

function response(html: string, status = 200, setCookie?: string): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(html, { status, headers });
}

function renderChallenge(csrfToken: string, errors: FieldError[] = []): string {
  return renderAuthPage({
    title: "Verify it’s you",
    description: "Enter the six-digit code from your authenticator app, or use a recovery code.",
    csrfToken,
    body: `<form method="post" action="/auth/mfa" class="auth-card" data-validate>
      <h2>Multi-factor authentication</h2>
      ${formErrorsSummary(errors)}
      ${renderAuthField({
        id: "code",
        name: "code",
        label: "Authentication or recovery code",
        required: true,
        autocomplete: "one-time-code",
        error: fieldErrorFor(errors, "code"),
        hint: "Recovery codes contain letters and numbers.",
        msgRequired: "Enter an authentication or recovery code",
      })}
      <label class="auth-checkbox"><input type="checkbox" name="remember_browser" value="true" /> Remember this browser for 30 days</label>
      <input type="hidden" name="_csrf" value="${csrfToken}" />
      <div class="auth-actions"><button type="submit" class="auth-button">Continue</button></div>
      <p class="auth-footer"><a class="auth-link" href="/auth/login">Cancel and sign in again</a></p>
    </form>`,
  });
}

function renderExpired(csrfToken: string): string {
  return renderAuthPage({
    title: "Sign in again",
    description: "This verification challenge has expired or was already used.",
    csrfToken,
    body: `<div class="auth-card"><div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div></div>`,
  });
}

async function getMfaPage(req: BunRequest): Promise<Response> {
  const challenge = await resolveMfaChallenge(req);
  const csrf = preparePageCsrf(req);
  return withSetCookie(response(challenge ? renderChallenge(csrf.token) : renderExpired(csrf.token), challenge ? 200 : 401), csrf.setCookie);
}

async function postMfaPage(req: BunRequest): Promise<Response> {
  const form = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, form._csrf);
  if (csrfError) {
    const csrf = preparePageCsrf(req);
    return withSetCookie(response(renderChallenge(csrf.token, [{ field: "_csrf", message: "Refresh the page and try again." }]), 403), csrf.setCookie);
  }
  const completed = await completeMfaSignIn(req, form.code ?? "", form.remember_browser === "true");
  if (!completed.ok) {
    const csrf = preparePageCsrf(req);
    let message = "Enter a valid authentication or recovery code.";
    try {
      const body = (await completed.response.json()) as { errors?: Array<{ message: string }> };
      message = body.errors?.[0]?.message ?? message;
    } catch {
      // Keep generic copy.
    }
    return withSetCookie(response(renderChallenge(csrf.token, [{ field: "code", message }]), completed.response.status), csrf.setCookie);
  }
  const fallback = completed.result.realm === "app" ? "/oauth/resume" : "/";
  const location = safeReturnPath(completed.result.returnPath, fallback);
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", completed.result.setSessionCookie);
  headers.append("Set-Cookie", completed.result.clearChallengeCookie);
  if (completed.result.rememberedBrowserCookie) headers.append("Set-Cookie", completed.result.rememberedBrowserCookie);
  return new Response(null, { status: 303, headers });
}

export const mfaWebRoutes = {
  "/auth/mfa": {
    GET: getMfaPage,
    POST: postMfaPage,
  },
} as const;
