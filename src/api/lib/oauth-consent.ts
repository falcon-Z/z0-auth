import { getAppSignInSettingsForApi } from "./auth-settings";
import { getDb } from "./db";
import { parseScopeSet } from "./oauth";

export function normalizeScopeString(scope: string): string {
  return scope.trim().replace(/\s+/g, " ");
}

export function scopeIsSubset(requestedScope: string, grantedScope: string): boolean {
  const requested = parseScopeSet(requestedScope);
  const granted = parseScopeSet(grantedScope);
  for (const name of requested) {
    if (!granted.has(name)) return false;
  }
  return true;
}

export function mergeScopeStrings(...scopes: string[]): string {
  const merged = new Set<string>();
  for (const scope of scopes) {
    for (const name of parseScopeSet(scope)) {
      merged.add(name);
    }
  }
  return [...merged].sort().join(" ");
}

export type OAuthUserConsent = {
  appUserId: string;
  appId: string;
  scope: string;
  grantedAt: Date;
  updatedAt: Date;
};

export async function getOAuthUserConsent(
  appUserId: string,
  appId: string,
): Promise<OAuthUserConsent | null> {
  const [row] = await getDb()`
    SELECT app_user_id, app_id, scope, granted_at, updated_at
    FROM oauth_user_consents
    WHERE app_user_id = ${appUserId}
      AND app_id = ${appId}
    LIMIT 1
  `;
  if (!row) return null;
  const data = row as {
    app_user_id: string;
    app_id: string;
    scope: string;
    granted_at: Date;
    updated_at: Date;
  };
  return {
    appUserId: String(data.app_user_id),
    appId: String(data.app_id),
    scope: data.scope ?? "",
    grantedAt: data.granted_at,
    updatedAt: data.updated_at,
  };
}

export async function upsertOAuthUserConsent(input: {
  appUserId: string;
  appId: string;
  requestedScope: string;
}): Promise<void> {
  const existing = await getOAuthUserConsent(input.appUserId, input.appId);
  const scope = mergeScopeStrings(existing?.scope ?? "", input.requestedScope);

  await getDb()`
    INSERT INTO oauth_user_consents (app_user_id, app_id, scope, granted_at, updated_at)
    VALUES (${input.appUserId}, ${input.appId}, ${scope}, NOW(), NOW())
    ON CONFLICT (app_user_id, app_id)
    DO UPDATE SET
      scope = EXCLUDED.scope,
      updated_at = NOW()
  `;
}

export type OAuthConsentDisplayScope = {
  name: string;
  description: string | null;
};

export type OAuthConsentPageContext = {
  appName: string;
  branding: {
    name: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
  };
  scopes: OAuthConsentDisplayScope[];
};

export async function getOAuthConsentPageContext(
  appId: string,
  requestedScope: string,
): Promise<OAuthConsentPageContext> {
  const [appRow] = await getDb()`
    SELECT name
    FROM apps
    WHERE id = ${appId}
    LIMIT 1
  `;
  const settings = await getAppSignInSettingsForApi(appId);
  const appName =
    settings?.branding.name?.trim() ||
    (appRow as { name: string } | undefined)?.name?.trim() ||
    "Application";

  const scopeNames = [...parseScopeSet(requestedScope)];
  let scopeRows: OAuthConsentDisplayScope[] = [];
  if (scopeNames.length > 0) {
    const rows = await getDb()`
      SELECT name, description
      FROM app_scopes
      WHERE app_id = ${appId}
    `;
    const byName = new Map(
      (rows as { name: string; description: string | null }[]).map((row) => [row.name, row.description]),
    );
    scopeRows = scopeNames.map((name) => ({
      name,
      description: byName.get(name) ?? null,
    }));
  }

  return {
    appName,
    branding: {
      name: settings?.branding.name ?? appName,
      logoUrl: settings?.branding.logoUrl ?? null,
      primaryColor: settings?.branding.primaryColor ?? null,
    },
    scopes: scopeRows,
  };
}
