import type { SetupResponse } from "@shared/contracts/setup";

export function buildRecoveryMailto(email: string, organizationName: string, recoveryKey: string): string {
  const subject = encodeURIComponent("Z0 Auth — Platform recovery key (store securely)");
  const body = encodeURIComponent(
    [
      `Z0 Auth recovery key for organization: ${organizationName}`,
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      "",
      `Recovery key (store securely, do not share):`,
      recoveryKey,
      "",
      "Use this key at the forgot-password page if you lose access to your account.",
      "Email is not encrypted. Prefer a password manager or encrypted storage.",
      "",
      "Documentation: /docs/security/recovery-key",
    ].join("\n"),
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export function downloadRecoveryKeyFile(organizationName: string, recoveryKey: string): void {
  const slug = organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    "Z0 Auth — Platform recovery key",
    "================================",
    "",
    `Organization: ${organizationName}`,
    `Date: ${date}`,
    "",
    "Recovery key (keep secret):",
    recoveryKey,
    "",
    "Store this file in an encrypted location and delete copies you no longer need.",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `z0-auth-recovery-key-${slug || "organization"}-${date}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export type SetupCompleteState = SetupResponse & { email: string };
