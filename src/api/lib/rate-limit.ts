type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

function getOrCreateBucket(key: string, windowMs: number, now: number): Bucket {
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  return bucket;
}

export function checkRateLimit(config: RateLimitConfig): { allowed: boolean; retryAfterSec?: number } {
  if (process.env.Z0_DISABLE_RATE_LIMIT === "1") {
    return { allowed: true };
  }

  const now = Date.now();
  const bucket = getOrCreateBucket(config.key, config.windowMs, now);
  bucket.count += 1;

  if (bucket.count > config.limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

/** Read current bucket usage without incrementing. */
export function isRateLimited(config: RateLimitConfig): { limited: boolean; retryAfterSec?: number } {
  if (process.env.Z0_DISABLE_RATE_LIMIT === "1") {
    return { limited: false };
  }

  const now = Date.now();
  const bucket = buckets.get(config.key);
  if (!bucket || now >= bucket.resetAt) {
    return { limited: false };
  }

  if (bucket.count >= config.limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { limited: true, retryAfterSec };
  }

  return { limited: false };
}

/** Increment rate-limit usage after a failed attempt. */
export function recordRateLimitHit(config: RateLimitConfig): void {
  if (process.env.Z0_DISABLE_RATE_LIMIT === "1") {
    return;
  }

  const now = Date.now();
  const bucket = getOrCreateBucket(config.key, config.windowMs, now);
  bucket.count += 1;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "local";
}

/** Clear buckets between tests. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
