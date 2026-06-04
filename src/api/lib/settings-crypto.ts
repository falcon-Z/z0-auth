import { decryptWithDataKey, encryptWithDataKey } from "./instance-keys";

export async function encryptSecret(plaintext: string): Promise<string> {
  return encryptWithDataKey(plaintext);
}

export async function decryptSecret(ciphertextB64: string): Promise<string> {
  return decryptWithDataKey(ciphertextB64);
}
