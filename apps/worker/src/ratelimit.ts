export interface RateLimitOptions {
  capacity: number;
  refillPerSecond: number;
  now: () => number;
  /** Upper bound on tracked keys so attacker-chosen keys cannot grow memory without limit. */
  maxKeys: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** In-memory token bucket per key. State is lost on restart, which is fine for rate limiting. */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimitOptions) {}

  take(key: string): RateLimitResult {
    const { capacity, refillPerSecond, now, maxKeys } = this.options;
    const t = now();
    const existing = this.buckets.get(key);
    let tokens = capacity;
    if (existing !== undefined) {
      const elapsedSeconds = Math.max(0, t - existing.updatedAt) / 1000;
      tokens = Math.min(capacity, existing.tokens + elapsedSeconds * refillPerSecond);
      this.buckets.delete(key); // re-inserted below so Map order stays least-recently-used first
    } else {
      this.evictIfFull(maxKeys, t);
    }
    if (tokens >= 1) {
      this.buckets.set(key, { tokens: tokens - 1, updatedAt: t });
      return { allowed: true };
    }
    this.buckets.set(key, { tokens, updatedAt: t });
    return { allowed: false, retryAfterSeconds: Math.ceil((1 - tokens) / refillPerSecond) };
  }

  private evictIfFull(maxKeys: number, t: number): void {
    if (this.buckets.size < maxKeys) return;
    const { capacity, refillPerSecond } = this.options;
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + (Math.max(0, t - bucket.updatedAt) / 1000) * refillPerSecond;
      if (refilled >= capacity) this.buckets.delete(key);
    }
    // Still full of active buckets: drop the least recently used one.
    if (this.buckets.size >= maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done !== true) this.buckets.delete(oldest.value);
    }
  }
}
