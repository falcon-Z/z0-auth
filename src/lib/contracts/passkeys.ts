import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

export type PasskeySummary = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  backupEligible: boolean;
  backedUp: boolean;
};

export type PasskeyList = {
  passkeys: PasskeySummary[];
  canRegister: boolean;
  maxPasskeys: number;
};

export type PasskeyRegistrationOptions = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

export type PasskeyRegistrationVerifyRequest = {
  response: RegistrationResponseJSON;
  label?: string;
  clientId?: string;
};

export type PasskeyAuthenticationOptionsRequest = {
  email?: string;
  clientId?: string;
  returnTo?: string;
  stepUp?: boolean;
};

export type PasskeyAuthenticationOptions = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type PasskeyAuthenticationVerifyRequest = {
  response: AuthenticationResponseJSON;
  clientId?: string;
};

export type PasskeyAuthenticationResult = {
  authenticated: true;
  returnPath: string;
  stepUp: boolean;
};

export type PasskeyRenameRequest = {
  passkeyId: string;
  label: string;
  clientId?: string;
};

export type PasskeyDeleteRequest = {
  passkeyId: string;
  clientId?: string;
};
