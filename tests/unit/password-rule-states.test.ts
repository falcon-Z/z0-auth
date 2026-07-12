import { describe, expect, test } from "bun:test";

import {
  getPasswordChecklistStates,
  passwordChecklistRules,
  passwordRules,
} from "@z0/contracts/password-policy";

describe("getPasswordChecklistStates", () => {
  test("pending when empty and not attempted", () => {
    const { rules } = getPasswordChecklistStates("");
    expect(rules.every((s) => s.state === "pending")).toBe(true);
    expect(rules.length).toBe(3);
  });

  test("all failed when empty and attempted", () => {
    const { rules } = getPasswordChecklistStates("", {}, { attempted: true });
    expect(rules.every((s) => s.state === "failed")).toBe(true);
  });

  test("failedLabels maps validation messages to the checklist", () => {
    const failed = ["Not a commonly used password"];
    const { rules } = getPasswordChecklistStates("", {}, { failedLabels: failed });
    const byId = Object.fromEntries(rules.map((s) => [s.id, s.state]));
    expect(byId.not_weak).toBe("failed");
    expect(byId.min_length).toBe("met");
    expect(rules.length).toBe(passwordChecklistRules.length);
  });

  test('"test" fails not_weak before minimum length is met', () => {
    const { rules } = getPasswordChecklistStates("test");
    expect(rules.find((s) => s.id === "not_weak")?.state).toBe("failed");
  });

  test("live password does not require a character mix", () => {
    const { rules } = getPasswordChecklistStates("short", { email: "a@b.co", name: "Admin" });
    expect(rules.some((s) => s.id === "character_mix")).toBe(false);
    expect(rules.find((s) => s.id === "min_length")?.state).toBe("failed");
  });

  test("strong password passes all checklist rules", () => {
    const { rules, extraInvalid } = getPasswordChecklistStates("ValidPassphrase99!", {
      email: "a@b.co",
      name: "Admin",
    });
    expect(rules.every((s) => s.state === "met")).toBe(true);
    expect(extraInvalid).toBe(false);
  });

  test("max length sets extraInvalid without a checklist item", () => {
    const long = "A".repeat(129) + "a1!";
    const { rules, extraInvalid } = getPasswordChecklistStates(long);
    expect(extraInvalid).toBe(true);
    expect(rules.some((r) => r.id === "max_length")).toBe(false);
    expect(passwordRules.some((r) => r.id === "max_length")).toBe(true);
  });
});
