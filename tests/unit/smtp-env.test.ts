import { afterEach, describe, expect, test } from "bun:test";

import {
  getSmtpEnvCredentials,
  isSmtpEnvDisabled,
  isSmtpEnvManaged,
} from "../../src/api/lib/smtp-env";

const original = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(original, key)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

describe("SMTP environment contract", () => {
  test("explicit disablement is authoritative", () => {
    process.env.SMTP_ENABLED = "false";
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isSmtpEnvDisabled()).toBe(true);
    expect(isSmtpEnvManaged()).toBe(true);
    expect(getSmtpEnvCredentials()).toBeNull();
  });

  test("partial environment configuration fails instead of falling back", () => {
    delete process.env.SMTP_ENABLED;
    process.env.SMTP_HOST = "smtp.example.com";
    delete process.env.SMTP_FROM_ADDRESS;
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_HOST and SMTP_FROM_ADDRESS");
  });

  test("unauthenticated relay configuration does not require a password", () => {
    delete process.env.SMTP_ENABLED;
    process.env.SMTP_HOST = "smtp.internal";
    process.env.SMTP_FROM_ADDRESS = "auth@example.com";
    delete process.env.SMTP_USERNAME;
    delete process.env.SMTP_PASSWORD;
    expect(getSmtpEnvCredentials()?.password).toBeNull();
  });
});
