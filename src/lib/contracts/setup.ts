export type SetupStatus = {
  completed: boolean;
  /** False when DATABASE_URL works but migrations have not been applied yet. */
  schemaReady: boolean;
  /** True when INSTALL_TOKEN is configured — HTML form shows token field; API requires X-Install-Token. */
  installTokenRequired: boolean;
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

export type SetupResponse = {
  user: SetupUser;
  organizationName: string;
};
