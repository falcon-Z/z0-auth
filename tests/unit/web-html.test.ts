import { describe, expect, test } from "bun:test";

import { passwordChecklistRules } from "@z0/contracts/password-policy";
import { formErrorsSummary, renderAuthField, renderPasswordChecklist, renderPasswordField } from "../../src/web/html";

describe("web html helpers", () => {
  test("formErrorsSummary renders only form-level errors with icon", () => {
    expect(formErrorsSummary([])).toBe("");
    const html = formErrorsSummary([{ field: "_form", message: "Something went wrong" }]);
    expect(html).toContain("auth-form-error");
    expect(html).toContain("auth-status-icon--warning");
    expect(html).not.toContain("href=");
  });

  test("renderPasswordChecklist shows unmapped server policy errors", () => {
    const html = renderPasswordChecklist({
      failedLabels: ["One lowercase letter", "One special character"],
    });
    expect(html).toContain("auth-password-max-error");
    expect(html).toContain("auth-password-rule--met");
    expect(html).toContain("auth-status-icon--warning");
    expect(html).toContain("auth-status-icon--success");
    expect(html).not.toContain("One lowercase letter");
    expect(html).not.toContain("At most 128");
  });

  test("renderPasswordField uses hint styling and red input border", () => {
    const html = renderPasswordField({
      attempted: true,
      failedLabels: ["One lowercase letter"],
    });
    expect(html).toContain("auth-hint auth-password-checklist");
    expect(html).toContain("auth-field--invalid");
    expect(html).not.toContain("font-weight: 500");
  });

  test("renderAuthField shows warning icon for inline errors", () => {
    const html = renderAuthField({
      id: "email",
      name: "email",
      label: "Email",
      type: "email",
      error: "Enter your email address",
      msgRequired: "Enter your email address",
    });
    expect(html).toContain("auth-status-icon--warning");
    expect(html).toContain("auth-field-error__text");
  });

  test("password checklist has three display rules", () => {
    const html = renderPasswordChecklist();
    expect(html.match(/data-rule-id="/g)?.length).toBe(3);
    for (const rule of passwordChecklistRules) {
      expect(html).toContain(rule.label);
    }
  });
});
