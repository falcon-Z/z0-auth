/**
 * Z0 Auth - Cryptography Utilities
 * 
 * Argon2id for password/API key hashing
 * HMAC-SHA256 for signing and verification
 * Uses Bun's built-in crypto module (available globally)
 */

// Argon2id defaults tuned for interactive authentication workloads.
const ARGON2_OPTIONS = {
  algorithm: 'argon2id' as const,
  memoryCost: 19456,
  timeCost: 2,
};

/**
 * Hash a secret (password or API key) using Argon2id
 * Output is suitable for secure storage in database
 */
export async function hashSecret(secret: string): Promise<string> {
  return Bun.password.hash(secret, ARGON2_OPTIONS);
}

/**
 * Verify a secret against a hash
 */
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  if (!hash.startsWith('$argon2id$')) return false;
  return Bun.password.verify(secret, hash);
}

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate an opaque API key with Z0 prefix
 * Format: z0_pk_<keyId>_<secret>
 * Only the keyId and hashed secret are stored; full key shown only once on creation
 */
export function generateAPIKey(keyId: string): { keyId: string; secret: string; full: string } {
  const secret = generateRandomString(32);
  const full = `z0_pk_${keyId}_${secret}`;
  return { keyId, secret, full };
}

/**
 * Hash an API key secret for storage
 */
export async function hashAPIKey(secret: string): Promise<string> {
  return hashSecret(secret);
}

/**
 * Verify an API key secret
 */
export async function verifyAPIKey(secret: string, hash: string): Promise<boolean> {
  return verifySecret(secret, hash);
}

/**
 * Generate a HMAC signature for request signing (server-to-server)
 */
export async function generateHMAC(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a HMAC signature
 */
export async function verifyHMAC(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = Uint8Array.from(
    signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(data));
}
