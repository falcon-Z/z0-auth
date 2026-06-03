import { apiFetch } from "./http-client";

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
