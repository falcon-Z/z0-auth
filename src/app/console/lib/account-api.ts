import { apiFetch } from "./http-client";
import type { MfaEnrollment, MfaRecoveryCodes, MfaStatus, RememberedBrowser } from "@z0/contracts/mfa";

export async function changePassword(body: {
  currentPassword: string;
  password: string;
  passwordConfirm: string;
}): Promise<void> {
  await apiFetch("/api/auth/change-password", {
    method: "POST",
    body,
  });
}

export function getMfaStatus(): Promise<MfaStatus> {
  return apiFetch<MfaStatus>("/api/auth/mfa");
}

export function startMfaEnrollment(): Promise<MfaEnrollment> {
  return apiFetch<MfaEnrollment>("/api/auth/mfa/enrollment", { method: "POST" });
}

export function confirmMfaEnrollment(code: string): Promise<MfaRecoveryCodes> {
  return apiFetch<MfaRecoveryCodes>("/api/auth/mfa/enrollment/confirm", { method: "POST", body: { code } });
}

export function regenerateMfaRecoveryCodes(code: string): Promise<MfaRecoveryCodes> {
  return apiFetch<MfaRecoveryCodes>("/api/auth/mfa/recovery-codes", { method: "POST", body: { code } });
}

export function disableMfa(code: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/mfa", { method: "DELETE", body: { code } });
}

export function stepUpMfa(code: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/mfa/step-up", { method: "POST", body: { code } });
}

export function listMfaRememberedBrowsers(): Promise<{ browsers: RememberedBrowser[] }> {
  return apiFetch<{ browsers: RememberedBrowser[] }>("/api/auth/mfa/remembered-browsers");
}

export function revokeMfaRememberedBrowser(browserId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/mfa/remembered-browsers", { method: "DELETE", body: { browserId } });
}
