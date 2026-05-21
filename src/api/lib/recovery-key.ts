import { verifyPassword, hashPassword } from "./password";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 32 bytes → 52 char Base32 (no padding), ~160 bits entropy. */
export function generateRecoveryKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output.match(/.{1,4}/g)?.join("-") ?? output;
}

export function normalizeRecoveryKey(key: string): string {
  return key.replace(/[\s-]/g, "").toUpperCase();
}

export async function hashRecoveryKey(key: string): Promise<string> {
  return hashPassword(normalizeRecoveryKey(key));
}

export async function verifyRecoveryKey(key: string, hash: string): Promise<boolean> {
  return verifyPassword(normalizeRecoveryKey(key), hash);
}
