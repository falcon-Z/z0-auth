type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

export function checkRateLimit(config: RateLimitConfig): { allowed: boolean; retryAfterSec?: number } {
  if (process.env.Z0_DISABLE_RATE_LIMIT === "1") {
    return { allowed: true };
  }

  const now = Date.now();
  let bucket = buckets.get(config.key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    buckets.set(config.key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > config.limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
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
