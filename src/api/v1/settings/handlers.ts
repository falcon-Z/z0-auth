import type { PutEmailSettingsRequest, TestEmailRequest } from "@z0/contracts/email-settings";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
import { requireInstanceMember } from "../../lib/instance-members";
import type { RoutedRequest } from "../../lib/path-router";
import { deliverEmail } from "../../lib/smtp-mail";
import {
  getEmailSettingsForApi,
  getSmtpCredentialsForSend,
  markEmailVerified,
  putEmailSettings,
  validateTestRecipient,
} from "../../lib/smtp-settings";
import { writeAuditEvent } from "../../lib/audit";

export async function handleGetEmailSettings(req: RoutedRequest): Promise<Response> {
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;
  const settings = await getEmailSettingsForApi();
  return json(settings);
}

export async function handlePutEmailSettings(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PutEmailSettingsRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await putEmailSettings(parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "smtp.settings_updated",
    resourceType: "smtp_settings",
    resourceId: "1",
  });

  return json(result.settings);
}

export async function handleTestEmail(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<TestEmailRequest>(req);
  if (!parsed.ok) return parsed.response;

  const recipient = validateTestRecipient(parsed.body.to ?? "");
  if (!recipient.ok) return recipient.response;

  const creds = await getSmtpCredentialsForSend();
  if (!creds) {
    return problem(409, "Conflict", "Configure and enable SMTP before sending a test email.", {
      errors: [
        {
          field: "_smtp",
          code: ErrorCodes.SMTP_NOT_CONFIGURED,
          message: "SMTP is not configured or not enabled",
        },
      ],
    });
  }

  const appName = process.env.APP_NAME ?? "z0-auth";
  const sent = await deliverEmail({
    to: recipient.email,
    subject: `${appName} test email`,
    text: `This is a test message from ${appName}. If you received it, SMTP is working.`,
  });

  if (!sent.ok) {
    return problem(502, "Bad Gateway", "Could not send test email.", {
      errors: [
        {
          field: "_smtp",
          code: ErrorCodes.SMTP_DELIVERY_FAILED,
          message: sent.message,
        },
      ],
    });
  }

  await markEmailVerified();
  const settings = await getEmailSettingsForApi();

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "smtp.test_sent",
    resourceType: "smtp_settings",
    resourceId: "1",
    payload: { to: recipient.email },
  });

  return json({
    ok: true as const,
    verifiedAt: settings.verifiedAt ?? new Date().toISOString(),
  });
}
