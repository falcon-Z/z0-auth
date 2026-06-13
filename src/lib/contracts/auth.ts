export type LoginRequest = {
  email: string;
  password: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  password: string;
  passwordConfirm: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type SessionResponse = {
  authenticated: boolean;
  user?: SessionUser;
  /** True when the user can use the developer console. */
  isInstanceMember?: boolean;
  /** True when this member created the instance at setup (owner). */
  isBootstrap?: boolean;
  /** Instance organization display name from setup. */
  organizationName?: string;
};

export type AuthenticatedSessionPayload = SessionResponse & {
  authenticated: true;
  user: SessionUser;
  isInstanceMember: boolean;
  isBootstrap: boolean;
  organizationName: string;
};
