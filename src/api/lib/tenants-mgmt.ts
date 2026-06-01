import type { CreateTenantRequest, TenantSummary } from "@z0/contracts/tenants";
import { ErrorCodes } from "@z0/contracts/errors";
import type { FieldError } from "@z0/contracts/errors";
import { validateRequiredString } from "@z0/contracts/validation";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { assignTenantRole } from "./roles";
import { listAllTenants, listUserTenants, slugifyOrganization, type Tenant } from "./tenant";
import { userHasPermission } from "./permissions";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TENANT_SLUG_UNIQUE_INDEX = "tenants_slug_unique";

function isTenantSlugUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return error instanceof Error && /slug/i.test(error.message) && error.message.includes("unique");
  }
  const pg = error as { code?: string; constraint?: string; message?: string };
  if (pg.code === "23505") {
    if (pg.constraint === TENANT_SLUG_UNIQUE_INDEX) return true;
    return /slug/i.test(pg.constraint ?? "") || /slug/i.test(pg.message ?? "");
  }
  return error instanceof Error && /slug/i.test(error.message) && error.message.includes("unique");
}

function mapTenantSummary(tenant: Tenant): TenantSummary {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isDefault: tenant.isDefault,
  };
}

export function validateCreateTenantBody(body: CreateTenantRequest): FieldError[] {
  const errors: FieldError[] = [];
  errors.push(...validateRequiredString(body.name, "name", "Name"));
  errors.push(...validateRequiredString(body.slug, "slug", "Slug"));

  if (typeof body.slug === "string" && body.slug.trim()) {
    const slug = body.slug.trim().toLowerCase();
    if (slug.length > 64 || !SLUG_RE.test(slug)) {
      errors.push({
        field: "slug",
        code: ErrorCodes.INVALID_SLUG,
        message: "Slug must use lowercase letters, numbers, and hyphens only",
      });
    }
  }

  return errors;
}

export async function listTenantsForUser(userId: string): Promise<TenantSummary[]> {
  const canReadAll = await userHasPermission(userId, "platform:tenants:read");
  const tenants = canReadAll ? await listAllTenants() : await listUserTenants(userId);
  return tenants.map(mapTenantSummary);
}

export async function createOrganization(
  actorUserId: string,
  body: CreateTenantRequest,
): Promise<{ ok: true; tenant: TenantSummary } | { ok: false; response: Response }> {
  const errors = validateCreateTenantBody(body);
  if (errors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid create organization request", { errors }),
    };
  }

  const name = body.name.trim();
  const slug = body.slug.trim().toLowerCase();
  const joinAsAdmin = body.joinAsAdmin === true;
  const db = getDb();

  try {
    const tenant = await db.begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO tenants (name, slug, is_default)
        VALUES (${name}, ${slug}, false)
        RETURNING id, name, slug, is_default
      `;

      const tenantId = String((inserted as { id: string }).id);
      const summary = mapTenantSummary({
        id: tenantId,
        name: (inserted as { name: string }).name,
        slug: (inserted as { slug: string }).slug,
        isDefault: Boolean((inserted as { is_default: boolean }).is_default),
      });

      if (joinAsAdmin) {
        await tx`
          INSERT INTO tenant_memberships (user_id, tenant_id, role)
          VALUES (${actorUserId}, ${tenantId}, 'tenant_admin')
        `;
        await assignTenantRole(actorUserId, tenantId, "tenant_admin", tx);
      }

      await writeAuditEvent(
        {
          tenantId,
          actorUserId,
          action: "tenant.created",
          resourceType: "tenant",
          resourceId: tenantId,
          payload: { name, slug, joinAsAdmin },
        },
        tx,
      );

      if (joinAsAdmin) {
        await writeAuditEvent(
          {
            tenantId,
            actorUserId,
            action: "tenant.member_joined",
            resourceType: "tenant_membership",
            resourceId: actorUserId,
            payload: { role: "tenant_admin" },
          },
          tx,
        );
      }

      return summary;
    });

    return { ok: true, tenant };
  } catch (error) {
    if (isTenantSlugUniqueViolation(error)) {
      return {
        ok: false,
        response: problem(409, "Conflict", "This slug is already in use.", {
          errors: [
            {
              field: "slug",
              code: ErrorCodes.SLUG_TAKEN,
              message: "This slug is already in use",
            },
          ],
        }),
      };
    }
    throw error;
  }
}

export function suggestSlugFromName(name: string): string {
  return slugifyOrganization(name);
}
