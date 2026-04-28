import { describe, expect, it } from 'bun:test';
import {
  generateAPIKey,
  generateRandomString,
  hashAPIKey,
  hashSecret,
  verifyAPIKey,
  verifySecret,
} from '../../src/lib/crypto';

describe('Crypto utilities', () => {
  it('hashSecret uses Argon2id format', async () => {
    const hash = await hashSecret('StrongPass123!');

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifySecret validates matching and non-matching secrets', async () => {
    const hash = await hashSecret('StrongPass123!');

    expect(await verifySecret('StrongPass123!', hash)).toBe(true);
    expect(await verifySecret('WrongPass123!', hash)).toBe(false);
  });

  it('verifySecret rejects non-Argon2 hashes', async () => {
    const legacyLikeHash = 'pbkdf2:sha256:100000:deadbeef:cafebabe';

    expect(await verifySecret('StrongPass123!', legacyLikeHash)).toBe(false);
  });

  it('hashAPIKey and verifyAPIKey use the same Argon2id behavior', async () => {
    const hash = await hashAPIKey('api-secret-value');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyAPIKey('api-secret-value', hash)).toBe(true);
    expect(await verifyAPIKey('wrong-secret', hash)).toBe(false);
  });

  it('generateRandomString returns expected hex length', () => {
    const random = generateRandomString(16);

    expect(random.length).toBe(32);
    expect(/^[0-9a-f]+$/.test(random)).toBe(true);
  });

  it('generateAPIKey returns expected format and secret metadata', () => {
    const key = generateAPIKey('abc123');

    expect(key.keyId).toBe('abc123');
    expect(key.secret.length).toBe(64);
    expect(key.full).toBe(`z0_pk_abc123_${key.secret}`);
  });
});
