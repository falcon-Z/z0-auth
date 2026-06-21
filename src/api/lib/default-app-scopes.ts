import { getDb } from "./db";

export const DEFAULT_OIDC_APP_SCOPES = [
  { name: "openid", description: "Sign in with OpenID Connect" },
  { name: "profile", description: "View your name" },
  { name: "email", description: "View your email address" },
  { name: "federation:token", description: "Retrieve upstream provider tokens for signed-in users" },
] as const;

export async function seedDefaultOidcScopesForApp(tx: ReturnType<typeof getDb>, appId: string): Promise<void> {
  for (const scope of DEFAULT_OIDC_APP_SCOPES) {
    await tx`
      INSERT INTO app_scopes (app_id, name, description)
      SELECT ${appId}, ${scope.name}, ${scope.description}
      WHERE NOT EXISTS (
        SELECT 1
        FROM app_scopes existing
        WHERE existing.app_id = ${appId}
          AND existing.name = ${scope.name}
      )
    `;
  }
}
