import { getDb } from "./db";

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

let testGeneration = 0;
let lastCleanupAt = 0;

function bucketKey(key: string): string {
  return process.env.NODE_ENV === "test" ? `test-${testGeneration}:${key}` : key;
}

async function increment(config: RateLimitConfig): Promise<{ count: number; expiresAt: Date }> {
  const now = Date.now();
  if (now - lastCleanupAt >= 60_000) {
    lastCleanupAt = now;
    await getDb()`DELETE FROM rate_limit_buckets WHERE expires_at <= NOW()`;
  }
  const expiresAt = new Date(Date.now() + config.windowMs);
  const [row] = await getDb()`
    INSERT INTO rate_limit_buckets (key, count, expires_at)
    VALUES (${bucketKey(config.key)}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.expires_at <= NOW() THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      expires_at = CASE
        WHEN rate_limit_buckets.expires_at <= NOW() THEN EXCLUDED.expires_at
        ELSE rate_limit_buckets.expires_at
      END
    RETURNING count, expires_at
  `;
  const result = row as { count: number; expires_at: Date };
  return { count: Number(result.count), expiresAt: new Date(result.expires_at) };
}

export async function checkRateLimit(
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const bucket = await increment(config);
  if (bucket.count > config.limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1000)) };
  }
  return { allowed: true };
}

export async function isRateLimited(
  config: RateLimitConfig,
): Promise<{ limited: boolean; retryAfterSec?: number }> {
  const [row] = await getDb()`
    SELECT count, expires_at FROM rate_limit_buckets
    WHERE key = ${bucketKey(config.key)} AND expires_at > NOW()
  `;
  if (!row || Number((row as { count: number }).count) < config.limit) return { limited: false };
  const expiresAt = new Date((row as { expires_at: Date }).expires_at);
  return { limited: true, retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) };
}

export async function recordRateLimitHit(config: RateLimitConfig): Promise<void> {
  await increment(config);
}

export function clientIp(req: Request): string {
  const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10);
  if (!Number.isInteger(hops) || hops < 1) return "direct";
  const forwarded = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (forwarded.length < hops) return "unknown";
  return forwarded[forwarded.length - hops] ?? "unknown";
}

/** Isolate rate-limit keys between tests without adding a production bypass. */
export function resetRateLimitsForTests(): void {
  testGeneration += 1;
}
