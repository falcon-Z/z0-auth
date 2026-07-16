#!/usr/bin/env bun

import { closeDatabase, getDb } from "../api/lib/db";
import { writeAuditEvent } from "../api/lib/audit";
import { normalizeEmail } from "../lib/contracts/validation";

function argument(name: string): string | null {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1]?.trim() || null : null;
}

const email = normalizeEmail(argument("--email") ?? "");
const confirmation = normalizeEmail(argument("--confirm-email") ?? "");
const acknowledged = Bun.argv.includes("--revoke-all-sessions");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!email || email !== confirmation || !acknowledged) {
  console.error(
    "Usage: bun run mfa:reset-owner --email owner@example.com " +
      "--confirm-email owner@example.com --revoke-all-sessions",
  );
  process.exit(1);
}

try {
  const result = await getDb().begin(async (tx) => {
    const [owner] = await tx`
      SELECT u.id
      FROM users u
      JOIN instance_members m ON m.user_id = u.id AND m.is_bootstrap = TRUE
      WHERE lower(u.email) = ${email} AND u.deleted_at IS NULL
      FOR UPDATE
    `;
    if (!owner) return "not_found" as const;
    const userId = String((owner as { id: string }).id);
    const [factor] = await tx`SELECT 1 FROM user_totp_factors WHERE user_id = ${userId}`;
    if (!factor) return "not_enabled" as const;

    await tx`DELETE FROM user_totp_factors WHERE user_id = ${userId}`;
    await tx`DELETE FROM user_mfa_recovery_codes WHERE user_id = ${userId}`;
    await tx`UPDATE user_mfa_challenges SET consumed_at = NOW() WHERE user_id = ${userId} AND consumed_at IS NULL`;
    await tx`UPDATE user_mfa_remembered_browsers SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    await writeAuditEvent({
      action: "mfa.local_owner_reset",
      resourceType: "console_member",
      resourceId: userId,
      payload: { realm: "console", source: "local_operator" },
    }, tx);
    return "reset" as const;
  });

  if (result === "not_found") {
    console.error("The confirmed email does not belong to the instance owner.");
    process.exitCode = 1;
  } else if (result === "not_enabled") {
    console.error("MFA is not enabled for the instance owner.");
    process.exitCode = 1;
  } else {
    console.log("Owner MFA was reset and all owner sessions were revoked.");
  }
} finally {
  await closeDatabase();
}
