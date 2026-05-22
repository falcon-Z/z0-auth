import { describe, expect, test } from "bun:test";

import { passwordRules } from "@z0/contracts/password-policy";
import { formErrorsSummary, renderAuthField, renderPasswordChecklist, renderPasswordField } from "../../packages/server/src/web/html";

describe("web html helpers", () => {
  test("formErrorsSummary renders only form-level errors", () => {
    expect(formErrorsSummary([])).toBe("");
    expect(formErrorsSummary([{ field: "email", message: "Email is required" }])).toBe("");
    const html = formErrorsSummary([{ field: "_form", message: "Something went wrong" }]);
    expect(html).toContain("auth-form-error");
    expect(html).not.toContain("href=");
  });

  test("renderPasswordChecklist marks failed server rules with met for others", () => {
    const html = renderPasswordChecklist({
      failedLabels: ["At least 14 characters", "One number"],
    });
    expect(html).toContain("auth-password-rule--failed");
    expect(html).toContain("auth-password-rule--met");
    expect(html).toContain("At least 14 characters");
    expect(html).toContain("✗");
    expect(html).toContain("✓");
  });

  test("renderPasswordField uses checklist not inline error", () => {
    const html = renderPasswordField({
      attempted: true,
      failedLabels: ["One lowercase letter"],
    });
    expect(html).toContain("data-password-field");
    expect(html).toContain("auth-password-checklist");
    expect(html).toContain('id="password-error"');
    expect(html).toContain("auth-password-rule--failed");
    expect(html).not.toContain('class="auth-field-error" role="alert"');
  });

  test("renderAuthField shows inline error for non-password fields", () => {
    const html = renderAuthField({
      id: "email",
      name: "email",
      label: "Email",
      type: "email",
      error: "Enter your email address",
      msgRequired: "Enter your email address",
    });
    expect(html).toContain('class="auth-field-error" role="alert"');
    expect(html).toContain("Enter your email address");
  });

  test("password checklist includes all policy rules", () => {
    const html = renderPasswordChecklist();
    for (const rule of passwordRules) {
      expect(html).toContain(rule.label);
      expect(html).toContain(`data-rule-id="${rule.id}"`);
    }
  });
});
