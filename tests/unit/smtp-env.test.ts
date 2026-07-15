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

  test("rejects unknown SMTP_ENABLED values", () => {
    process.env.SMTP_ENABLED = "yes";
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_ENABLED must be true or false");
  });

  test("explicit enablement requires host and sender", () => {
    process.env.SMTP_ENABLED = "true";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM_ADDRESS;
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_HOST and SMTP_FROM_ADDRESS");
  });

  test("rejects invalid numeric and sender values", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM_ADDRESS = "not-an-email";
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_FROM_ADDRESS");
    process.env.SMTP_FROM_ADDRESS = "auth@example.com";
    process.env.SMTP_PORT = "1e3";
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_PORT");
    delete process.env.SMTP_PORT;
    process.env.SMTP_HOST = "smtp.example.com:587";
    expect(() => getSmtpEnvCredentials()).toThrow("SMTP_HOST");
  });
});
