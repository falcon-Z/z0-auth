import { escapeHtml, renderAuthPage } from "../html";

type AppLoginContext = { clientId: string; appName: string };

function magicLinkLoginHref(app?: AppLoginContext, returnTo?: string): string {
  if (!app) return "/auth/login";
  const query = new URLSearchParams({ client_id: app.clientId });
  if (returnTo) query.set("return_to", returnTo);
  return `/auth/login?${query.toString()}`;
}

export type MagicLinkRequestOutcome = {
  sent: boolean;
  reason?: "no_account" | "account_disabled" | "delivery_failed";
};

export function renderMagicLinkSentPage(
  csrfToken: string,
  email: string,
  app?: AppLoginContext,
  options?: { passwordFallbackHref?: string },
): string {
  const title = "Check your email";
  const description = app
    ? `We sent a sign-in link to ${email} for ${app.appName}.`
    : `We sent a sign-in link to ${email}.`;
  const passwordLink = options?.passwordFallbackHref
    ? `<div class="auth-actions"><a class="auth-link" href="${escapeHtml(options.passwordFallbackHref)}">Sign in with password instead</a></div>`
    : "";
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card">
      <p class="auth-footer">The link expires in 15 minutes. You can close this tab.</p>
      ${passwordLink}
    </div>`,
  });
}

export function renderMagicLinkDisabledAccountPage(csrfToken: string, loginHref = "/auth/login"): string {
  const title = "Account unavailable";
  const description = "This account is disabled.";
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card">
      <p class="auth-footer">Contact your administrator if you need access restored.</p>
      <div class="auth-actions"><a class="auth-button" href="${escapeHtml(loginHref)}">Back to sign in</a></div>
    </div>`,
  });
}

export function renderMagicLinkInviteOnlyPage(csrfToken: string): string {
  const title = "Invitation required";
  const description = "New accounts are created through an organization invitation.";
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card">
      <p class="auth-footer">Ask your administrator for an invitation, or open the link from your invitation email.</p>
      <div class="auth-actions"><a class="auth-button" href="/auth/login">Back to sign in</a></div>
    </div>`,
  });
}

export function renderMagicLinkRegisterPromptPage(
  csrfToken: string,
  email: string,
  app: AppLoginContext,
  returnTo?: string,
): string {
  const registerQuery = new URLSearchParams({ client_id: app.clientId });
  if (returnTo) registerQuery.set("return_to", returnTo);
  const title = "No account yet";
  const description = `There is no account for ${email} on ${app.appName}.`;
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card">
      <p class="auth-footer">Create an account to continue, or try a different email.</p>
      <div class="auth-actions"><a class="auth-button" href="/auth/register?${escapeHtml(registerQuery.toString())}">Create account</a></div>
      <p class="auth-footer"><a class="auth-link" href="/auth/login?${escapeHtml(registerQuery.toString())}">Back to sign in</a></p>
    </div>`,
  });
}

export function renderMagicLinkOutcomePage(
  csrfToken: string,
  outcome: MagicLinkRequestOutcome,
  options: {
    email: string;
    realm: "console" | "app";
    app?: AppLoginContext;
    returnTo?: string;
    passwordFallbackHref?: string;
  },
): string {
  if (!outcome.sent && outcome.reason === "account_disabled") {
    return renderMagicLinkDisabledAccountPage(csrfToken, magicLinkLoginHref(options.app, options.returnTo));
  }

  if (!outcome.sent && outcome.reason === "no_account") {
    if (options.realm === "console") {
      return renderMagicLinkInviteOnlyPage(csrfToken);
    }
    if (options.app) {
      return renderMagicLinkRegisterPromptPage(csrfToken, options.email, options.app, options.returnTo);
    }
  }

  return renderMagicLinkSentPage(csrfToken, options.email, options.app, {
    passwordFallbackHref: options.passwordFallbackHref,
  });
}
