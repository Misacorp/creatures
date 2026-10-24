import { describe, expect, it } from 'vitest';
import {
  SWEEP_S,
  barrierShards,
  insideHexagon,
  shardAlpha,
  shardMix,
  shardScatter,
  shardSweep,
} from './barrier-shards';

describe('the triangles of a barrier', () => {
  const W = 200;
  const H = 190;
  const shards = barrierShards(W, H, 16, 'glass');

  it('builds a regular hexagon of whole equilateral triangles, centred, the outer ring marked', () => {
    // The hexagon's side is 6 triangles (the box's half width, 100 px, to the nearest 16): 6 * 6 * 6
    // triangles fill a hexagon of side 6.
    expect(shards).toHaveLength(6 * 6 * 6);
    for (const s of shards) {
      const [ax, ay, bx, by, cx, cy] = s.points;
      for (const side of [
        Math.hypot(bx - ax, by - ay),
        Math.hypot(cx - bx, cy - by),
        Math.hypot(ax - cx, ay - cy),
      ]) {
        expect(side).toBeCloseTo(16, 5);
      }
      expect(insideHexagon(s.cx - W / 2, s.cy - H / 2, 96)).toBe(true);
    }
    const xs = shards.map((s) => s.cx);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(W, 5);
    // The outer ring of a side-6 hexagon: 6 * (2 * 6 - 1) triangles.
    expect(shards.filter((s) => s.edge)).toHaveLength(6 * 11);
  });

  it('has straight sides: every corner of the hexagon is a corner of a triangle', () => {
    const a = 96;
    const h = (Math.sqrt(3) / 2) * a;
    const corners = [
      [a, 0],
      [a / 2, h],
      [-a / 2, h],
      [-a, 0],
      [-a / 2, -h],
      [a / 2, -h],
    ].map(([x, y]) => [W / 2 + (x ?? 0), H / 2 + (y ?? 0)] as const);
    const vertices = shards.flatMap((s) => [
      [s.points[0], s.points[1]],
      [s.points[2], s.points[3]],
      [s.points[4], s.points[5]],
    ]);
    for (const [x, y] of corners) {
      expect(vertices.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 1e-6)).toBe(true);
    }
    // No triangle pokes out past the hexagon: every corner of every triangle is inside or on it.
    for (const [vx, vy] of vertices) {
      expect(insideHexagon(vx - W / 2, vy - H / 2, a + 1e-6)).toBe(true);
    }
  });

  it('is the same every time (no randomness)', () => {
    expect(barrierShards(W, H, 16, 'glass')).toEqual(shards);
  });

  it('shimmers within see-through bounds', () => {
    for (const s of shards.slice(0, 60)) {
      for (const t of [0, 0.7, 3.1, 9.9]) {
        const a = shardAlpha(s, t, 0.2);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(0.45);
        const m = shardMix(s, t);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('sweeps its shine from the top left to the bottom right, then rests', () => {
    const topLeft = shards.reduce((a, b) => (b.diag < a.diag ? b : a));
    const bottomRight = shards.reduce((a, b) => (b.diag > a.diag ? b : a));
    const peak = (s: (typeof shards)[number]) => {
      let best = 0;
      let at = 0;
      for (let k = 0; k <= 160; k++) {
        const t = (k / 160) * SWEEP_S;
        const v = shardSweep(s, t);
        if (v > best) [best, at] = [v, t];
      }
      return at;
    };
    expect(peak(topLeft)).toBeLessThan(peak(bottomRight));
    expect(shardSweep(bottomRight, SWEEP_S + 0.5)).toBe(0);
  });

  it('flies the triangles outward when it shatters', () => {
    for (const s of shards) {
      const start = shardScatter(s, 0);
      expect([start.x, start.y, Math.abs(start.turn)]).toEqual([s.cx, s.cy, 0]);
      const end = shardScatter(s, 1);
      const out = (end.x - s.cx) * s.dx + (end.y - s.side * 1.5 - s.cy) * s.dy;
      expect(out).toBeGreaterThan(0);
    }
  });
});
