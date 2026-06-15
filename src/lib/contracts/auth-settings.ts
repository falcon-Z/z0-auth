export type EmailDeliveryStatus = "sent" | "failed" | "skipped";

export type SignInMethod = "password" | "magic_link";

export const SIGN_IN_METHODS: SignInMethod[] = ["password", "magic_link"];

export type InstanceSignInSettingsResponse = {
  signInMethods: SignInMethod[];
  updatedAt: string | null;
};

export type PutInstanceSignInSettingsRequest = {
  signInMethods: SignInMethod[];
};

export type AppBranding = {
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type AppSignInSettingsResponse = {
  appId: string;
  signInMethods: SignInMethod[];
  branding: AppBranding;
  updatedAt: string | null;
};

export type PutAppSignInSettingsRequest = {
  signInMethods: SignInMethod[];
  branding?: Partial<AppBranding>;
};
