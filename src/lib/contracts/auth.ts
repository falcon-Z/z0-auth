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

