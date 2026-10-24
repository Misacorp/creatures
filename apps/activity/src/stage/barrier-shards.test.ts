import { describe, expect, it } from 'vitest';
import { barrierShards, insideDome, shardAlpha, shardMix, shardScatter } from './barrier-shards';

describe('the triangles of a barrier', () => {
  const shards = barrierShards(120, 100, 9, 'glass');

  it('fills a dome with equilateral triangles, the edge ones marked', () => {
    expect(shards.length).toBeGreaterThan(100);
    expect(shards.length).toBeLessThan(400);
    for (const s of shards) {
      const [ax, ay, bx, by, cx, cy] = s.points;
      const sides = [
        Math.hypot(bx - ax, by - ay),
        Math.hypot(cx - bx, cy - by),
        Math.hypot(ax - cx, ay - cy),
      ];
      for (const side of sides) expect(side).toBeCloseTo(9, 5);
      expect(insideDome(s.cx, s.cy, 120, 100)).toBe(true);
    }
    expect(shards.some((s) => s.edge)).toBe(true);
    expect(shards.some((s) => !s.edge)).toBe(true);
    // The top corners are cut away: a dome, not a box.
    expect(insideDome(2, 2, 120, 100)).toBe(false);
  });

  it('is the same every time (no randomness)', () => {
    expect(barrierShards(120, 100, 9, 'glass')).toEqual(shards);
  });

  it('shimmers within see-through bounds', () => {
    for (const s of shards.slice(0, 40)) {
      for (const t of [0, 0.7, 3.1, 9.9]) {
        const a = shardAlpha(s, t, 0.2);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(0.5);
        const m = shardMix(s, t);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('flies the triangles outward when it shatters', () => {
    for (const s of shards) {
      const start = shardScatter(s, 0);
      expect([start.x, start.y, Math.abs(start.turn)]).toEqual([s.cx, s.cy, 0]);
      const end = shardScatter(s, 1);
      const out = (end.x - s.cx) * s.dx + (end.y - 22 - s.cy) * s.dy;
      expect(out).toBeGreaterThan(0);
    }
  });
});
