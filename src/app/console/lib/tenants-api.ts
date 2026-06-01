import type {
  CreateTenantRequest,
  CreateTenantResponse,
  ListTenantsResponse,
  TenantSummary,
} from "@z0/contracts/tenants";

import { apiFetch } from "./http-client";

export async function fetchTenants(): Promise<TenantSummary[]> {
  const { tenants } = await apiFetch<ListTenantsResponse>("/api/v1/tenants");
  return tenants;
}

export async function createTenant(body: CreateTenantRequest): Promise<TenantSummary> {
  const { tenant } = await apiFetch<CreateTenantResponse>("/api/v1/tenants", {
    method: "POST",
    body,
  });
  return tenant;
}

export function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  return base || "organization";
}
