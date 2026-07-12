import type { FieldError } from "./errors";
import { ErrorCodes } from "./errors";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/** Project-local compromised/common password blocklist; no network dependency at validation time. */
const BLOCKED_PASSWORDS = new Set(
  [
    "123456", "123456789", "12345678", "12345", "1234567", "1234567890",
    "password", "password1", "password123", "qwerty", "qwerty123", "abc123",
    "111111", "123123", "admin", "letmein", "welcome", "monkey", "dragon",
    "master", "login", "princess", "football", "baseball", "shadow", "sunshine",
    "iloveyou", "trustno1", "passw0rd", "p@ssw0rd", "qwertyuiop", "asdfghjkl",
    "zaq12wsx", "1q2w3e4r", "1qaz2wsx", "000000", "666666", "654321",
    "superman", "charlie", "donald", "secret", "freedom", "whatever", "killer",
    "jordan", "michael", "batman", "computer", "internet", "changeme", "testing",
    "test", "superadmin",
  ],
);

function normalizedForBlocklist(password: string): string {
  return password.toLowerCase().replace(/[^a-z0-9@]/g, "");
}

export function isBlockedPassword(password: string): boolean {
  const normalized = normalizedForBlocklist(password);
  const withoutNumericSuffix = normalized.replace(/\d{1,8}$/, "");
  return (
    BLOCKED_PASSWORDS.has(normalized) ||
    BLOCKED_PASSWORDS.has(withoutNumericSuffix) ||
    /^(.)\1{7,}$/.test(normalized) ||
    "1234567890".includes(normalized) ||
    "0987654321".includes(normalized)
  );
}

function passesNotWeakRule(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  return !isBlockedPassword(password);
}

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
    id: "not_weak",
    label: "Not a commonly used password",
    test: (p) => passesNotWeakRule(p),
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

/** Checklist shown in the setup form (subset of validation rules). */
export const passwordChecklistRules: PasswordRule[] = [
  {
    id: "min_length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: requireNonEmpty((p) => p.length >= PASSWORD_MIN_LENGTH),
  },
  {
    id: "not_weak",
    label: "Not a commonly used password",
    test: (p) => passesNotWeakRule(p),
  },
  {
    id: "not_contextual",
    label: "Does not contain your name or email",
    test: requireNonEmpty((p, ctx) => !containsContextualSubstring(p, ctx)),
  },
];

/** Maps API validation messages to checklist rule ids. */
export const passwordValidationToChecklistId: Record<string, string> = {
  [`At least ${PASSWORD_MIN_LENGTH} characters`]: "min_length",
  "Not a commonly used password": "not_weak",
  "Does not contain your name or email": "not_contextual",
};

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

function failedChecklistIds(failedLabels: string[]): { ids: Set<string>; hasUnmapped: boolean } {
  const ids = new Set<string>();
  let hasUnmapped = false;
  for (const label of failedLabels) {
    const checklistId = passwordValidationToChecklistId[label];
    if (checklistId) ids.add(checklistId);
    else hasUnmapped = true;
  }
  return { ids, hasUnmapped };
}

export type PasswordChecklistResult = {
  rules: PasswordRuleStatus[];
  /** True when validation failed outside the checklist (e.g. max length). */
  extraInvalid: boolean;
};

/**
 * Status for each password checklist item (setup form UI).
 * When the server returns policy errors, pass failedLabels so passed rules still show as met.
 */
export function getPasswordChecklistStates(
  password: string,
  ctx: PasswordPolicyContext = {},
  options: { attempted?: boolean; failedLabels?: string[] } = {},
): PasswordChecklistResult {
  const { attempted = false, failedLabels } = options;

  if (password.length > 0) {
    return {
      extraInvalid: password.length > PASSWORD_MAX_LENGTH,
      rules: passwordChecklistRules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        state: rule.test(password, ctx) ? "met" : "failed",
      })),
    };
  }

  if (failedLabels && failedLabels.length > 0) {
    const { ids, hasUnmapped } = failedChecklistIds(failedLabels);
    return {
      extraInvalid: hasUnmapped,
      rules: passwordChecklistRules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        state: ids.has(rule.id) ? "failed" : "met",
      })),
    };
  }

  if (attempted) {
    return {
      extraInvalid: false,
      rules: passwordChecklistRules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        state: "failed",
      })),
    };
  }

  return {
    extraInvalid: false,
    rules: passwordChecklistRules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      state: "pending",
    })),
  };
}
