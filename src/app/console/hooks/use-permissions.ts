import { useSession } from "../context/session-context";

export function usePermissions() {
  const { session } = useSession();
  const scopes = session.scopes ?? [];

  function hasScope(scope: string): boolean {
    return scopes.includes(scope);
  }

  function hasAnyScope(required: string[]): boolean {
    return required.some((scope) => scopes.includes(scope));
  }

  return {
    scopes,
    roles: session.roles ?? [],
    isOwner: Boolean(session.isBootstrap),
    hasScope,
    hasAnyScope,
  };
}
