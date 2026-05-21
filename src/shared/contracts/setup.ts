export type SetupStatus = {
  completed: boolean;
  organizationName?: string;
};

export type SetupRequest = {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  organizationName: string;
};

export type SetupUser = {
  id: string;
  email: string;
  name: string;
};

export type SetupTenant = {
  id: string;
  name: string;
  slug: string;
};

export type SetupResponse = {
  user: SetupUser;
  organizationName: string;
  tenant: SetupTenant;
  recoveryKey: string;
};
