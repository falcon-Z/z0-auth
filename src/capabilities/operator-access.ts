export type AuthorizeOperatorTask = {
  operatorId: string;
  requiredScope: string;
};

export type OperatorAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "permission_denied" };

export type AuthorizeScopeGrant = {
  operatorId: string;
  requestedScopes: string[];
};

export type ScopeGrantAuthorization =
  | { allowed: true }
  | {
    allowed: false;
    reason: "grant_exceeds_authority";
    missingScopes: string[];
  };

export interface OperatorAccess {
  authorizeOperatorTask(
    input: AuthorizeOperatorTask,
  ): Promise<OperatorAuthorization>;
  authorizeScopeGrant(
    input: AuthorizeScopeGrant,
  ): Promise<ScopeGrantAuthorization>;
}

export type OperatorAccessDependencies = {
  getOperatorScopeKeys(operatorId: string): Promise<string[]>;
};

export function createOperatorAccess(
  dependencies: OperatorAccessDependencies,
): OperatorAccess {
  return {
    async authorizeOperatorTask(input) {
      const scopes = await dependencies.getOperatorScopeKeys(input.operatorId);
      return scopes.includes(input.requiredScope)
        ? { allowed: true }
        : { allowed: false, reason: "permission_denied" };
    },

    async authorizeScopeGrant(input) {
      const heldScopes = new Set(
        await dependencies.getOperatorScopeKeys(input.operatorId),
      );
      const missingScopes = [...new Set(input.requestedScopes)]
        .filter((scope) => !heldScopes.has(scope));

      return missingScopes.length === 0
        ? { allowed: true }
        : {
          allowed: false,
          reason: "grant_exceeds_authority",
          missingScopes,
        };
    },
  };
}
