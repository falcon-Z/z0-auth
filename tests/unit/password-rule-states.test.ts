import { describe, expect, test } from "bun:test";

import { getPasswordRuleStates, passwordRules } from "@z0/contracts/password-policy";

describe("getPasswordRuleStates", () => {
  test("pending when empty and not attempted", () => {
    const states = getPasswordRuleStates("");
    expect(states.every((s) => s.state === "pending")).toBe(true);
  });

  test("all failed when empty and attempted", () => {
    const states = getPasswordRuleStates("", {}, { attempted: true });
    expect(states.every((s) => s.state === "failed")).toBe(true);
  });

  test("failedLabels marks only failed rules met for the rest", () => {
    const failed = ["At least 14 characters", "One uppercase letter"];
    const states = getPasswordRuleStates("", {}, { failedLabels: failed });
    const byId = Object.fromEntries(states.map((s) => [s.id, s.state]));
    expect(byId.min_length).toBe("failed");
    expect(byId.uppercase).toBe("failed");
    expect(byId.lowercase).toBe("met");
  });

  test("live password evaluates each rule", () => {
    const states = getPasswordRuleStates("short", { email: "a@b.co", name: "Admin" });
    expect(states.find((s) => s.id === "min_length")?.state).toBe("failed");
    expect(states.find((s) => s.id === "uppercase")?.state).toBe("failed");
  });

  test("covers every password rule", () => {
    const states = getPasswordRuleStates("ValidPassphrase99!", { email: "a@b.co", name: "Admin" });
    expect(states.length).toBe(passwordRules.length);
    expect(states.every((s) => s.state === "met")).toBe(true);
  });
});
