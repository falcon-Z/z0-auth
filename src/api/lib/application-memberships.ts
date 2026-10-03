import type { SQL } from "bun";

import { revokeAppAccountAccess } from "./account-lifecycle";
import { writeAuditEvent } from "./audit";

export type MembershipChange = "active" | "disabled" | "removed";

/** The same Account/subject locks guard both membership mutation and issuance. */
export async function changeApplicationMembership(
  tx: SQL,
  appId: string,
  subjectId: string,
  state: MembershipChange,
  actorUserId: string,
): Promise<"updated" | "not_found" | "conflict"> {
  const [subject] = await tx`
    SELECT b.id, c.email, c.deleted_at
    FROM accounts c JOIN app_account_bindings b ON b.account_id = c.id
    WHERE b.id = ${subjectId} AND b.app_id = ${appId}
    FOR UPDATE OF c, b
  `;
  if (!subject) return "not_found";
  const [membership] = await tx`
    SELECT status FROM application_memberships WHERE subject_id = ${subjectId}
  `;
  if (state === "active" && subject.deleted_at) return "conflict";
  if (state === "disabled" && !membership) return "conflict";
  if (state === "removed") {
    await tx`DELETE FROM application_memberships WHERE subject_id = ${subjectId}`;
  } else {
    await tx`
      INSERT INTO application_memberships (subject_id, status, disabled_at)
      VALUES (${subjectId}, ${state}, ${state === "disabled" ? new Date() : null})
      ON CONFLICT (subject_id) DO UPDATE
      SET status = EXCLUDED.status, disabled_at = EXCLUDED.disabled_at, updated_at = NOW()
    `;
  }
  if (state !== "active") {
    await revokeAppAccountAccess(tx, subjectId, appId, String(subject.email));
  }
  if ((membership?.status ?? "removed") !== state) {
    await writeAuditEvent({
      actorUserId,
      action: `application_membership.${state === "removed" ? "removed" : state === "disabled" ? "disabled" : membership ? "enabled" : "created"}`,
      resourceType: "application_subject",
      resourceId: subjectId,
      payload: { appId, membershipStatus: state },
    }, tx);
  }
  return "updated";
}
