import { normalizeEmail } from "@z0/contracts/validation";
import type { SQL } from "bun";

import { getDb } from "./db";

export type ApplicationAccount = {
  accountId: string;
  accountDomainId: string;
  appUserId: string | null;
  membershipStatus: "active" | "disabled" | "removed";
  email: string;
  passwordHash: string | null;
  status: string;
  disabledAt: Date | null;
  lockedUntil: Date | null;
  deletedAt: Date | null;
};

/** Resolve identity authority first. A matching account need not have an app binding. */
export async function findAccountForApplication(
  appId: string,
  email: string,
): Promise<ApplicationAccount | null> {
  const [row] = await getDb()`
    SELECT c.id, c.account_domain_id, b.id AS app_user_id, c.email,
           c.password_hash, c.status, c.disabled_at, c.locked_until, c.deleted_at,
           COALESCE(m.status, 'removed') AS membership_status
    FROM apps a
    JOIN accounts c ON c.account_domain_id = a.account_domain_id
    LEFT JOIN app_account_bindings b ON b.app_id = a.id AND b.account_id = c.id
    LEFT JOIN application_memberships m ON m.subject_id = b.id
    WHERE a.id = ${appId} AND lower(c.email) = ${normalizeEmail(email)}
  `;
  if (!row) return null;
  return {
    accountId: String(row.id),
    accountDomainId: String(row.account_domain_id),
    appUserId: row.app_user_id ? String(row.app_user_id) : null,
    membershipStatus: row.membership_status as ApplicationAccount["membershipStatus"],
    email: String(row.email),
    passwordHash: row.password_hash as string | null,
    status: String(row.status),
    disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

/** Reserve a stable subject without granting membership or copying profile data. */
export async function ensureApplicationSubject(
  tx: SQL,
  appId: string,
  accountId: string,
): Promise<string | null> {
  const [account] = await tx`
    SELECT c.id, c.account_domain_id
    FROM accounts c JOIN apps a ON a.account_domain_id = c.account_domain_id
    WHERE a.id = ${appId} AND c.id = ${accountId}
    FOR UPDATE OF c
  `;
  if (!account) return null;
  await tx`
    INSERT INTO app_account_bindings (app_id, account_id, account_domain_id)
    VALUES (${appId}, ${accountId}, ${account.account_domain_id})
    ON CONFLICT (app_id, account_id) DO NOTHING
  `;
  const [subject] = await tx`
    SELECT id FROM app_account_bindings WHERE app_id = ${appId} AND account_id = ${accountId}
  `;
  return String(subject.id);
}
