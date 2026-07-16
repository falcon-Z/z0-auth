export type MfaStatus = {
  enabled: boolean;
  pendingEnrollment: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export type MfaEnrollment = {
  secret: string;
  provisioningUri: string;
  expiresAt: string;
};

export type MfaEnrollmentConfirmRequest = {
  code: string;
};

export type MfaRecoveryCodes = {
  recoveryCodes: string[];
};

export type MfaChallengeRequest = {
  code: string;
  rememberBrowser?: boolean;
};

export type MfaChallengeRequired = {
  authenticated: false;
  mfaRequired: true;
  challengeExpiresAt: string;
};

export type MfaChallengeResult = {
  authenticated: true;
  recoveryCodeUsed: boolean;
  recoveryCodesRemaining: number;
};

export type RememberedBrowser = {
  id: string;
  clientLabel: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};
