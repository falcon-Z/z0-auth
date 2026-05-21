export type LoginRequest = {
  email: string;
  password: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type SessionTenant = {
  id: string;
  name: string;
  slug: string;
};

export type SessionResponse = {
  authenticated: boolean;
  user?: SessionUser;
  roles?: string[];
  tenant?: SessionTenant;
};

export type ResetPasswordRequest = {
  email: string;
  recoveryKey: string;
  newPassword: string;
  passwordConfirm: string;
};

export type RegenerateRecoveryKeyRequest = {
  currentPassword: string;
};

export type RegenerateRecoveryKeyResponse = {
  recoveryKey: string;
};
