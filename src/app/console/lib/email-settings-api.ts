import type {
  EmailSettingsResponse,
  PutEmailSettingsRequest,
  TestEmailRequest,
  TestEmailResponse,
} from "@z0/contracts/email-settings";

import { apiFetch } from "./http-client";

export function fetchEmailSettings(): Promise<EmailSettingsResponse> {
  return apiFetch<EmailSettingsResponse>("/api/v1/settings/email");
}

export function putEmailSettings(body: PutEmailSettingsRequest): Promise<EmailSettingsResponse> {
  return apiFetch<EmailSettingsResponse>("/api/v1/settings/email", { method: "PUT", body });
}

export function sendTestEmail(body: TestEmailRequest): Promise<TestEmailResponse> {
  return apiFetch<TestEmailResponse>("/api/v1/settings/email/test", { method: "POST", body });
}
