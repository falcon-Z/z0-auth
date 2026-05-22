import {
  getPasswordRuleStates,
  type PasswordPolicyContext,
  type PasswordRuleStatus,
} from "@z0/contracts/password-policy";

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
  <script src="/static/auth-forms.js" defer></script>
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

export type FieldError = { field: string; message: string };

export function fieldErrorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function fieldErrorMessages(errors: FieldError[], field: string): string[] {
  return errors.filter((e) => e.field === field).map((e) => e.message);
}

/** Form-level errors only; field errors render inline next to each input. */
export function formErrorsSummary(errors: FieldError[]): string {
  const formError = errors.find((e) => e.field === "_form");
  if (!formError) return "";
  return `<p class="auth-form-error" role="alert">${escapeHtml(formError.message)}</p>`;
}

/** @deprecated Use formErrorsSummary — kept for tests referencing the name. */
export function fieldErrorsHtml(errors: FieldError[]): string {
  return formErrorsSummary(errors);
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
  const errorHtml = options.error
    ? `<p id="${errorId}" class="auth-field-error" role="alert">${escapeHtml(options.error)}</p>`
    : `<p id="${errorId}" class="auth-field-error" hidden></p>`;
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

function passwordRuleIcon(state: PasswordRuleStatus["state"]): string {
  if (state === "met") return "✓";
  if (state === "failed") return "✗";
  return "·";
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
  const states = getPasswordRuleStates(options.password ?? "", options.context ?? {}, {
    attempted: options.attempted,
    failedLabels: options.failedLabels,
  });
  const anyFailed = states.some((s) => s.state === "failed");
  const items = states
    .map((rule) => {
      const icon = passwordRuleIcon(rule.state);
      return `<li class="auth-password-rule auth-password-rule--${rule.state}" data-rule-id="${escapeHtml(rule.id)}" aria-label="${escapeHtml(passwordRuleAria(rule.state, rule.label))}">
        <span class="auth-password-rule__icon" aria-hidden="true">${icon}</span>
        <span>${escapeHtml(rule.label)}</span>
      </li>`;
    })
    .join("");

  return `<ul id="password-hint" class="auth-password-checklist${anyFailed ? " auth-password-checklist--invalid" : ""}" aria-label="Password requirements">${items}</ul>`;
}

export type PasswordFieldOptions = {
  value?: string;
  autocomplete?: string;
  context?: PasswordPolicyContext;
  attempted?: boolean;
  failedLabels?: string[];
};

export function renderPasswordField(options: PasswordFieldOptions = {}): string {
  const states = getPasswordRuleStates(options.value ?? "", options.context ?? {}, {
    attempted: options.attempted,
    failedLabels: options.failedLabels,
  });
  const anyFailed = states.some((s) => s.state === "failed");
  const invalidClass = anyFailed ? " auth-field--invalid" : "";
  const autocomplete = options.autocomplete
    ? ` autocomplete="${escapeHtml(options.autocomplete)}"`
    : "";

  return `<div class="auth-field${invalidClass}" data-password-field>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required${autocomplete}${anyFailed ? ' aria-invalid="true"' : ""} aria-describedby="password-hint" data-password-input />
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
