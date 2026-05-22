import type { FieldError } from "./errors";
import { ErrorCodes } from "./errors";

export const PASSWORD_MIN_LENGTH = 14;
export const PASSWORD_MAX_LENGTH = 128;

const SPECIAL_CHAR_RE = /[!-/:-@[-`{-~]/;

/** Common weak passwords (subset; extend as needed). */
const WEAK_PASSWORDS = new Set(
  [
    "password",
    "password1",
    "password123",
    "qwerty123456",
    "admin123456",
    "letmein123",
    "welcome123",
    "changeme123",
    "P@ssw0rd123!",
    "Password123!",
    "SuperAdmin123!",
  ].map((p) => p.toLowerCase()),
);

export type PasswordPolicyContext = {
  email?: string;
  name?: string;
};

export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string, ctx: PasswordPolicyContext) => boolean;
};

function requireNonEmpty(
  test: PasswordRule["test"],
): PasswordRule["test"] {
  return (password, ctx) => {
    if (password.length === 0) return false;
    return test(password, ctx);
  };
}

const passwordRulesBase: PasswordRule[] = [
  {
    id: "min_length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "max_length",
    label: `At most ${PASSWORD_MAX_LENGTH} characters`,
    test: (p) => p.length <= PASSWORD_MAX_LENGTH,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "One number",
    test: (p) => /\d/.test(p),
  },
  {
    id: "special",
    label: "One special character",
    test: (p) => SPECIAL_CHAR_RE.test(p),
  },
  {
    id: "not_weak",
    label: "Not a commonly used password",
    test: (p) => !WEAK_PASSWORDS.has(p.toLowerCase()),
  },
  {
    id: "not_contextual",
    label: "Does not contain your name or email",
    test: (p, ctx) => !containsContextualSubstring(p, ctx),
  },
];

export const passwordRules: PasswordRule[] = passwordRulesBase.map((rule) => ({
  ...rule,
  test: requireNonEmpty(rule.test),
}));

function containsContextualSubstring(password: string, ctx: PasswordPolicyContext): boolean {
  const lower = password.toLowerCase();
  const parts: string[] = [];

  if (ctx.name && ctx.name.trim().length >= 3) {
    parts.push(ctx.name.trim().toLowerCase());
  }
  if (ctx.email) {
    const local = ctx.email.split("@")[0]?.trim().toLowerCase();
    if (local && local.length >= 3) parts.push(local);
  }

  return parts.some((part) => lower.includes(part));
}

export function validatePassword(
  password: string,
  ctx: PasswordPolicyContext = {},
): FieldError[] {
  const errors: FieldError[] = [];

  for (const rule of passwordRules) {
    if (!rule.test(password, ctx)) {
      errors.push({
        field: "password",
        code: ErrorCodes.PASSWORD_POLICY,
        message: rule.label,
      });
    }
  }

  return errors;
}

export function validatePasswordConfirm(
  password: string,
  passwordConfirm: string,
): FieldError[] {
  if (password !== passwordConfirm) {
    return [
      {
        field: "passwordConfirm",
        code: ErrorCodes.PASSWORD_MISMATCH,
        message: "Passwords do not match",
      },
    ];
  }
  return [];
}

export function isPasswordPolicyMet(password: string, ctx: PasswordPolicyContext = {}): boolean {
  return validatePassword(password, ctx).length === 0;
}

export type PasswordRuleState = "pending" | "met" | "failed";

export type PasswordRuleStatus = {
  id: string;
  label: string;
  state: PasswordRuleState;
};

/**
 * Status for each password rule (checklist UI).
 * When the server returns policy errors, pass failedLabels so passed rules still show as met.
 */
export function getPasswordRuleStates(
  password: string,
  ctx: PasswordPolicyContext = {},
  options: { attempted?: boolean; failedLabels?: string[] } = {},
): PasswordRuleStatus[] {
  const { attempted = false, failedLabels } = options;

  if (failedLabels && failedLabels.length > 0) {
    const failedSet = new Set(failedLabels);
    return passwordRules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      state: failedSet.has(rule.label) ? "failed" : "met",
    }));
  }

  if (password.length > 0) {
    return passwordRules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      state: rule.test(password, ctx) ? "met" : "failed",
    }));
  }

  if (attempted) {
    return passwordRules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      state: "failed",
    }));
  }

  return passwordRules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    state: "pending",
  }));
}
