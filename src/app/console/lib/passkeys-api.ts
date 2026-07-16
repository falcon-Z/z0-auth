import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { PasskeyList, PasskeySummary } from "@z0/contracts/passkeys";
import { apiFetch } from "./http-client";

function fromBase64url(value: string): ArrayBuffer {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64url(value: ArrayBuffer | null): string | undefined {
  if (!value) return undefined;
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function creationOptions(options: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: fromBase64url(options.challenge),
    user: { ...options.user, id: fromBase64url(options.user.id) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: fromBase64url(credential.id),
    })),
  } as PublicKeyCredentialCreationOptions;
}

function requestOptions(options: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: fromBase64url(options.challenge),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: fromBase64url(credential.id),
    })),
  } as PublicKeyCredentialRequestOptions;
}

type AttestationResponseFuture = AuthenticatorAttestationResponse & {
  getTransports?: () => AuthenticatorTransport[];
  getPublicKeyAlgorithm?: () => number;
  getPublicKey?: () => ArrayBuffer | null;
  getAuthenticatorData?: () => ArrayBuffer;
};

function registrationResponse(credential: PublicKeyCredential): RegistrationResponseJSON {
  const response = credential.response as AttestationResponseFuture;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId)!,
    type: "public-key",
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON)!,
      attestationObject: toBase64url(response.attestationObject)!,
      transports: response.getTransports?.(),
      publicKeyAlgorithm: response.getPublicKeyAlgorithm?.(),
      publicKey: toBase64url(response.getPublicKey?.() ?? null),
      authenticatorData: toBase64url(response.getAuthenticatorData?.() ?? null),
    },
  } as RegistrationResponseJSON;
}

function authenticationResponse(credential: PublicKeyCredential): AuthenticationResponseJSON {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId)!,
    type: "public-key",
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON)!,
      authenticatorData: toBase64url(response.authenticatorData)!,
      signature: toBase64url(response.signature)!,
      userHandle: toBase64url(response.userHandle),
    },
  } as AuthenticationResponseJSON;
}

function requireWebAuthn(): void {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("This browser does not support passkeys.");
  }
}

export function getPasskeys(): Promise<PasskeyList> {
  return apiFetch<PasskeyList>("/api/auth/passkeys");
}

export async function registerPasskey(label?: string): Promise<PasskeySummary> {
  requireWebAuthn();
  const started = await apiFetch<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    "/api/auth/passkeys/registration/options",
    { method: "POST", body: {} },
  );
  const credential = await navigator.credentials.create({ publicKey: creationOptions(started.options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey setup was cancelled.");
  const finished = await apiFetch<{ passkey: PasskeySummary }>("/api/auth/passkeys/registration/verify", {
    method: "POST",
    body: { response: registrationResponse(credential), label },
  });
  return finished.passkey;
}

export function renamePasskey(passkeyId: string, label: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/passkeys/rename", { method: "POST", body: { passkeyId, label } });
}

export function removePasskey(passkeyId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/passkeys/remove", { method: "POST", body: { passkeyId } });
}

export async function stepUpWithPasskey(): Promise<void> {
  requireWebAuthn();
  const started = await apiFetch<{ options: PublicKeyCredentialRequestOptionsJSON }>(
    "/api/auth/passkeys/authentication/options",
    { method: "POST", body: { stepUp: true } },
  );
  const credential = await navigator.credentials.get({ publicKey: requestOptions(started.options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey verification was cancelled.");
  await apiFetch("/api/auth/passkeys/authentication/verify", {
    method: "POST",
    body: { response: authenticationResponse(credential) },
  });
}
