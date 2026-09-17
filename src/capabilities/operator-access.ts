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

export type OperatorAssuranceLevel =
  | "primary"
  | "multi_factor"
  | "phishing_resistant";

export type AuthorizeSensitiveOperatorTask = {
  assuranceLevel: OperatorAssuranceLevel;
  authenticatedAt: Date;
  requiredAssuranceLevel: OperatorAssuranceLevel;
  maximumAgeMs: number;
  now: Date;
};

export type SensitiveTaskAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "insufficient_assurance" | "stale_authentication" };

const assuranceRank: Record<OperatorAssuranceLevel, number> = {
  primary: 1,
  multi_factor: 2,
  phishing_resistant: 3,
};

export function authorizeSensitiveOperatorTask(
  input: AuthorizeSensitiveOperatorTask,
): SensitiveTaskAuthorization {
  if (assuranceRank[input.assuranceLevel] < assuranceRank[input.requiredAssuranceLevel]) {
    return { allowed: false, reason: "insufficient_assurance" };
  }
  const ageMs = input.now.getTime() - input.authenticatedAt.getTime();
  return ageMs >= 0 && ageMs <= input.maximumAgeMs
    ? { allowed: true }
    : { allowed: false, reason: "stale_authentication" };
}

export interface OperatorAccess {
  authorizeOperatorTask(
    input: AuthorizeOperatorTask,
  ): Promise<OperatorAuthorization>;
  authorizeScopeGrant(
    input: AuthorizeScopeGrant,
  ): Promise<ScopeGrantAuthorization>;
  authorizeSensitiveTask(
    input: AuthorizeSensitiveOperatorTask,
  ): SensitiveTaskAuthorization;
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

    authorizeSensitiveTask(input) {
      return authorizeSensitiveOperatorTask(input);
    },
  };
}
