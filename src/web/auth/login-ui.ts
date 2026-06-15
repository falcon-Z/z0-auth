import { escapeHtml, renderAuthPage } from "../html";

type AppLoginContext = { clientId: string; appName: string };

export function renderMagicLinkSentPage(
  csrfToken: string,
  email: string,
  app?: AppLoginContext,
  options?: { passwordFallbackHref?: string },
): string {
  const title = "Check your email";
  const description = app
    ? `If an account exists for ${email}, you will receive a sign-in link for ${app.appName} shortly.`
    : `If an account exists for ${email}, you will receive a sign-in link shortly.`;
  const passwordLink = options?.passwordFallbackHref
    ? `<div class="auth-actions"><a class="auth-link" href="${escapeHtml(options.passwordFallbackHref)}">Sign in with password instead</a></div>`
    : "";
  return renderAuthPage({
    title,
    description,
    csrfToken,
    body: `<div class="auth-card">
      <h2>${escapeHtml(title)}</h2>
      <p class="auth-lead">${escapeHtml(description)}</p>
      <p class="auth-footer">The link expires in 15 minutes. You can close this tab.</p>
      ${passwordLink}
    </div>`,
  });
}
