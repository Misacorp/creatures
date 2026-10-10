import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '../src/ratelimit';

function make(maxKeys = 100) {
  const clock = { t: 1_000_000 };
  const limiter = new TokenBucketLimiter({
    capacity: 3,
    refillPerSecond: 1,
    now: () => clock.t,
    maxKeys,
  });
  return { clock, limiter };
}

describe('TokenBucketLimiter', () => {
  it('allows up to capacity, then denies with a retry hint', () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i++) expect(limiter.take('a')).toEqual({ allowed: true });
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('refills over time and never above capacity', () => {
    const { clock, limiter } = make();
    for (let i = 0; i < 3; i++) limiter.take('a');
    clock.t += 1000;
    expect(limiter.take('a')).toEqual({ allowed: true });
    expect(limiter.take('a').allowed).toBe(false);
    clock.t += 60_000;
    for (let i = 0; i < 3; i++) expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('tracks keys independently', () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i++) limiter.take('a');
    expect(limiter.take('a').allowed).toBe(false);
    expect(limiter.take('b').allowed).toBe(true);
  });

  it('bounds memory by evicting when too many keys are tracked', () => {
    const { limiter } = make(2);
    limiter.take('a');
    limiter.take('b');
    limiter.take('c'); // evicts the least recently used key
    // 'a' was evicted, so it starts with a full bucket again.
    for (let i = 0; i < 3; i++) expect(limiter.take('a').allowed).toBe(true);
  });
});
