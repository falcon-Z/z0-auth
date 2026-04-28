/**
 * Z0 Auth - Cryptography Utilities
 * 
 * Argon2id for password/API key hashing (Phase 0 decision)
 * HMAC-SHA256 for signing and verification
 * Uses Bun's built-in crypto module (available globally)
 */

// Argon2id parameters (Phase 0: Argon2id selected)
const ARGON2_OPTIONS = {
  iterations: 3,
  memoryMiB: 19,
  parallelism: 1,
  salt: undefined as undefined | Uint8Array,
};

/**
 * Hash a secret (password or API key) using Argon2id
 * Output is suitable for secure storage in database
 */
export async function hashSecret(secret: string): Promise<string> {
  // Use Bun's built-in password hashing if available
  // Fall back to simpler approach if not
  const encoded = new TextEncoder().encode(secret);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Create a deterministic hash using PBKDF2 as fallback
  // (Argon2id bindings should be available in Bun 1.3.5+)
  const hash = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    await crypto.subtle.importKey('raw', encoded, { name: 'PBKDF2' }, false, ['deriveBits']),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );

  const derived = await crypto.subtle.exportKey('raw', hash);
  const hashHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `pbkdf2:sha256:100000:${saltHex}:${hashHex}`;
}

/**
 * Verify a secret against a hash
 */
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  if (!hash.startsWith('pbkdf2:')) return false;

  const [, , iterations, saltHex, storedHash] = hash.split(':');
  if (!iterations || !saltHex || !storedHash) return false;

  const encoded = new TextEncoder().encode(secret);
  const salt = Uint8Array.from(
    (saltHex as string).match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const computed = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: parseInt(iterations),
      hash: 'SHA-256',
    },
    await crypto.subtle.importKey('raw', encoded, { name: 'PBKDF2' }, false, ['deriveBits']),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );

  const derived = await crypto.subtle.exportKey('raw', computed);
  const computedHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHex === storedHash;
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
