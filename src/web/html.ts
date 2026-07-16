import {
  getPasswordChecklistStates,
  PASSWORD_MAX_LENGTH,
  type PasswordPolicyContext,
  type PasswordRuleStatus,
} from "@z0/contracts/password-policy";

const SVG_CHECK = `<svg class="auth-status-icon auth-status-icon--success" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.25 6.1 8.85 9.75 5.35"/></svg>`;

const SVG_CROSS = `<svg class="auth-status-icon auth-status-icon--error" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M5.1 5.1 8.9 8.9M8.9 5.1 5.1 8.9"/></svg>`;

const SVG_WARNING = `<svg class="auth-status-icon auth-status-icon--warning" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="currentColor" d="M7 4.25a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm0 6.5a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75Z"/></svg>`;

function renderFieldError(id: string, message: string, hidden = false): string {
  const visibility = hidden ? " hidden" : "";
  const body = hidden
    ? ""
    : `${SVG_WARNING}<span class="auth-field-error__text">${escapeHtml(message)}</span>`;
  return `<p id="${id}" class="auth-field-error" role="alert"${visibility}>${body}</p>`;
}

function passwordChecklistIcon(state: PasswordRuleStatus["state"]): string {
  if (state === "met") return SVG_CHECK;
  if (state === "failed") return SVG_CROSS;
  return "";
}

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

export type AuthPageBranding = {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export type AuthPageOptions = {
  title: string;
  description?: string;
  csrfToken: string;
  body: string;
  flash?: Flash;
  branding?: AuthPageBranding;
};

function renderAuthBrand(branding?: AuthPageBranding): string {
  const name = branding?.name?.trim();
  const logoUrl = branding?.logoUrl?.trim();
  if (logoUrl) {
    const alt = escapeHtml(name ?? "App");
    return `<p class="auth-brand auth-brand--logo"><img src="${escapeHtml(logoUrl)}" alt="${alt}" class="auth-brand__logo" /></p>`;
  }
  if (name) {
    return `<p class="auth-brand">${escapeHtml(name)}</p>`;
  }
  return `<p class="auth-brand">z0-auth</p>`;
}

export function renderAuthPage(options: AuthPageOptions): string {
  const description = options.description
    ? `<p class="auth-lead">${escapeHtml(options.description)}</p>`
    : "";
  const flash = options.flash
    ? `<div class="auth-flash auth-flash--${options.flash.variant}" role="alert">${escapeHtml(options.flash.message)}</div>`
    : "";
  const primaryColor = options.branding?.primaryColor?.trim();
  const bodyStyle = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? ` style="--primary: ${primaryColor}; --primary-foreground: #fafafa;"`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>${escapeHtml(options.title)} · ${escapeHtml(options.branding?.name?.trim() || "z0-auth")}</title>
  <link rel="stylesheet" href="/static/auth.css" />
  <script src="/static/htmx.min.js" defer></script>
  <script src="/static/auth-forms.js" defer></script>
  <script src="/static/mfa-qr.js" defer></script>
  <script src="/static/passkeys.js" defer></script>
</head>
<body class="auth-body"${bodyStyle}>
  <main id="auth-root" class="auth-main">
    <header class="auth-header">
      ${renderAuthBrand(options.branding)}
      <h1 class="auth-title">${escapeHtml(options.title)}</h1>
      ${description}
    </header>
    ${flash}
    ${options.body}
  </main>
</body>
</html>`;
}

export type FieldError = { field: string; message: string };

export function fieldErrorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function fieldErrorMessages(errors: FieldError[], field: string): string[] {
  return errors.filter((e) => e.field === field).map((e) => e.message);
}

/** Form-level errors only; field errors render inline next to each input. */
export function formErrorsSummary(errors: FieldError[]): string {
  const formError = errors.find((e) =>
    e.field === "_form" || e.field === "_auth" || e.field === "_rate" || e.field === "_csrf",
  );
  if (!formError) return "";
  return `<p class="auth-form-error" role="alert">${SVG_WARNING}<span class="auth-form-error__text">${escapeHtml(formError.message)}</span></p>`;
}

export type AuthFieldOptions = {
  id: string;
  name: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  autocomplete?: string;
  hint?: string;
  error?: string;
  extra?: string;
  msgRequired?: string;
  msgEmail?: string;
  msgMatch?: string;
  matchSelector?: string;
};

export function renderAuthField(options: AuthFieldOptions): string {
  const type = options.type ?? "text";
  const value = escapeHtml(options.value ?? "");
  const required = options.required ? " required" : "";
  const errorId = `${options.id}-error`;
  const hintId = `${options.id}-hint`;
  const hasError = Boolean(options.error);
  const invalidClass = hasError ? " auth-field--invalid" : "";
  const ariaInvalid = hasError ? ' aria-invalid="true"' : "";
  const ariaDescribedby = hasError
    ? ` aria-describedby="${errorId}"`
    : options.hint || options.extra
      ? ` aria-describedby="${hintId}"`
      : "";

  const dataMsgs = [
    options.msgRequired ? ` data-msg-required="${escapeHtml(options.msgRequired)}"` : "",
    options.msgEmail ? ` data-msg-email="${escapeHtml(options.msgEmail)}"` : "",
    options.msgMatch ? ` data-msg-match="${escapeHtml(options.msgMatch)}"` : "",
    options.matchSelector ? ` data-match="${escapeHtml(options.matchSelector)}"` : "",
  ].join("");

  const hintContent = [
    options.hint ? `<p class="auth-hint">${escapeHtml(options.hint)}</p>` : "",
    options.extra ?? "",
  ]
    .filter(Boolean)
    .join("");
  const hintBlock =
    hintContent.length > 0
      ? `<div id="${hintId}" class="auth-field-hint"${hasError ? " hidden" : ""}>${hintContent}</div>`
      : "";
  const errorHtml = renderFieldError(errorId, options.error ?? "", !options.error);
  const autocomplete = options.autocomplete
    ? ` autocomplete="${escapeHtml(options.autocomplete)}"`
    : "";

  return `<div class="auth-field${invalidClass}">
    <label for="${options.id}">${escapeHtml(options.label)}</label>
    <input id="${options.id}" name="${options.name}" type="${type}" value="${value}"${required}${autocomplete}${ariaInvalid}${ariaDescribedby}${dataMsgs} />
    ${errorHtml}
    ${hintBlock}
  </div>`;
}

function passwordRuleAria(state: PasswordRuleStatus["state"], label: string): string {
  if (state === "met") return `Met: ${label}`;
  if (state === "failed") return `Not met: ${label}`;
  return label;
}

export type PasswordChecklistOptions = {
  password?: string;
  context?: PasswordPolicyContext;
  attempted?: boolean;
  failedLabels?: string[];
};

export function renderPasswordChecklist(options: PasswordChecklistOptions = {}): string {
  const { rules, extraInvalid } = getPasswordChecklistStates(options.password ?? "", options.context ?? {}, {
    attempted: options.attempted,
    failedLabels: options.failedLabels,
  });
  const anyFailed = rules.some((s) => s.state === "failed") || extraInvalid;
  const items = rules
    .map((rule) => {
      const icon = passwordChecklistIcon(rule.state);
      const iconHtml = icon ? `<span class="auth-password-rule__icon">${icon}</span>` : "";
      return `<li class="auth-password-rule auth-password-rule--${rule.state}" data-rule-id="${escapeHtml(rule.id)}" aria-label="${escapeHtml(passwordRuleAria(rule.state, rule.label))}">
        ${iconHtml}<span class="auth-password-rule__label">${escapeHtml(rule.label)}</span>
      </li>`;
    })
    .join("");
  const maxHint = extraInvalid
    ? `<p class="auth-field-error auth-password-max-error" role="alert">${SVG_WARNING}<span class="auth-field-error__text">Use at most ${PASSWORD_MAX_LENGTH} characters</span></p>`
    : "";

  return `<ul id="password-hint" class="auth-hint auth-password-checklist" aria-label="Password requirements">${items}</ul>${maxHint}`;
}

export type PasswordFieldOptions = {
  value?: string;
  autocomplete?: string;
  context?: PasswordPolicyContext;
  attempted?: boolean;
  failedLabels?: string[];
};

export function renderPasswordField(options: PasswordFieldOptions = {}): string {
  const { rules, extraInvalid } = getPasswordChecklistStates(options.value ?? "", options.context ?? {}, {
    attempted: options.attempted,
    failedLabels: options.failedLabels,
  });
  const anyFailed = rules.some((s) => s.state === "failed") || extraInvalid;
  const invalidClass = anyFailed ? " auth-field--invalid" : "";
  const autocomplete = options.autocomplete
    ? ` autocomplete="${escapeHtml(options.autocomplete)}"`
    : "";
  const valueAttr =
    options.value !== undefined && options.value !== ""
      ? ` value="${escapeHtml(options.value)}"`
      : "";

  return `<div class="auth-field${invalidClass}" data-password-field>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required${autocomplete}${valueAttr}${anyFailed ? ' aria-invalid="true"' : ""} aria-describedby="password-hint" data-password-input />
    <p id="password-error" class="auth-field-error" hidden></p>
    <div class="auth-field-hint">
      ${renderPasswordChecklist({
        password: options.value,
        context: options.context,
        attempted: options.attempted,
        failedLabels: options.failedLabels,
      })}
    </div>
  </div>`;
}
