import { describe, expect, test } from "bun:test";

import {
  isPasswordPolicyMet,
  validatePassword,
  validatePasswordConfirm,
} from "@shared/contracts/password-policy";

describe("password policy", () => {
  test("rejects empty password", () => {
    expect(isPasswordPolicyMet("")).toBe(false);
    expect(validatePassword("").length).toBeGreaterThan(0);
  });

  test("rejects short passwords", () => {
    expect(isPasswordPolicyMet("Short1!", { email: "a@b.co", name: "Admin" })).toBe(false);
  });

  test("accepts strong password", () => {
    expect(isPasswordPolicyMet("ValidPassphrase99!", { email: "a@b.co", name: "Admin" })).toBe(true);
  });

  test("rejects password containing email local part", () => {
    const errors = validatePassword("adminuser-Valid99!XX", { email: "adminuser@example.com" });
    expect(errors.some((e) => e.code === "password_policy")).toBe(true);
  });

  test("detects password confirm mismatch", () => {
    const errors = validatePasswordConfirm("ValidPassphrase99!", "different");
    expect(errors[0]?.code).toBe("password_mismatch");
  });
});
