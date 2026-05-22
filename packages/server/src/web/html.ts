export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type Flash = {
  variant: "success" | "error";
  message: string;
};

export type AuthPageOptions = {
  title: string;
  description?: string;
  csrfToken: string;
  body: string;
  flash?: Flash;
};

export function renderAuthPage(options: AuthPageOptions): string {
  const description = options.description
    ? `<p class="auth-lead">${escapeHtml(options.description)}</p>`
    : "";
  const flash = options.flash
    ? `<div class="auth-flash auth-flash--${options.flash.variant}" role="alert">${escapeHtml(options.flash.message)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)} · z0-auth</title>
  <link rel="stylesheet" href="/static/auth.css" />
</head>
<body class="auth-body">
  <main class="auth-main">
    <header class="auth-header">
      <p class="auth-brand">z0-auth</p>
      <h1 class="auth-title">${escapeHtml(options.title)}</h1>
      ${description}
    </header>
    ${flash}
    ${options.body}
  </main>
</body>
</html>`;
}

export function fieldErrorsHtml(errors: { field: string; message: string }[]): string {
  if (errors.length === 0) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join("");
  return `<ul class="auth-errors" role="alert">${items}</ul>`;
}

export function renderPasswordChecklist(): string {
  return `<ul class="auth-hint" aria-label="Password requirements">
    <li>At least 14 characters</li>
    <li>Uppercase, lowercase, number, and special character</li>
    <li>Not a common password</li>
    <li>Does not contain your name or email</li>
  </ul>`;
}
