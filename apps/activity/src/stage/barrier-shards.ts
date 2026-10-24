/**
 * The triangles a barrier is built from (`Barrier.tsx`): equilateral triangles laid on their grid and
 * cut to a regular hexagon (flat top and bottom) whose corners sit on the grid, so the outline is
 * clean. Each triangle has its own small, stable variation (from its index: no `Math.random`). Pure,
 * so the shapes and the motion are tested without a canvas.
 */
import type { BarrierPattern } from '../move-fx';

export interface Shard {
  /** The three corners, x and y in turn, in CSS px from the barrier's top left. */
  points: readonly [number, number, number, number, number, number];
  /** Its centre. */
  cx: number;
  cy: number;
  /** In the hexagon's outer ring: a little brighter, so the shape reads without a border. */
  edge: boolean;
  /** Two stable values in [0, 1): when it shimmers and how its colour drifts. */
  phase: number;
  hue: number;
  /** How far along the diagonal from the top left (0) to the bottom right (1): the sweep's path. */
  diag: number;
  /** Where it flies when the barrier shatters: a unit direction away from the hexagon's middle. */
  dx: number;
  dy: number;
  /** Its side (CSS px): bigger pieces fly further. */
  side: number;
}

function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Whether (x, y) lies in the flat-topped regular hexagon of side `a` around (0, 0). */
export function insideHexagon(x: number, y: number, a: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return ay <= (Math.sqrt(3) / 2) * a && Math.sqrt(3) * ax + ay <= Math.sqrt(3) * a;
}

/**
 * The triangles of a barrier filling a `w` by `h` box (CSS px), each `side` px across: the largest
 * hexagon of whole triangles that fits (to the nearest triangle), centred in the box.
 */
export function barrierShards(
  w: number,
  h: number,
  side: number,
  pattern: BarrierPattern,
): Shard[] {
  const rh = (side * Math.sqrt(3)) / 2;
  // The hexagon's side, a whole number of triangles: as wide as the box, or as tall, whichever is less.
  const rings = Math.max(1, Math.round(Math.min(w / 2, h / Math.sqrt(3)) / side));
  const a = rings * side;
  const mx = w / 2;
  const my = h / 2;
  const left = mx - a;
  const top = my - (Math.sqrt(3) / 2) * a;
  const span = 2 * a + Math.sqrt(3) * a;
  // The bright outer ring: one triangle deep, two for a briar cage.
  const ring = side * (pattern === 'thorns' ? 2 : 1);
  const out: Shard[] = [];
  let n = 0;
  // Rows of the grid from the hexagon's top edge to its bottom, a corner of the grid at its middle.
  for (let r = -rings; r < rings; r++) {
    const y0 = my + r * rh;
    const off = (Math.abs(r) % 2) * (side / 2);
    for (let i = -rings * 2 - 1; i <= rings * 2; i++) {
      const x = mx + i * side + off;
      for (const up of [true, false]) {
        const x0 = up ? x : x + side / 2;
        const points: Shard['points'] = up
          ? [x0, y0 + rh, x0 + side / 2, y0, x0 + side, y0 + rh]
          : [x0, y0, x0 + side, y0, x0 + side / 2, y0 + rh];
        const cx = x0 + side / 2;
        const cy = up ? y0 + (rh * 2) / 3 : y0 + rh / 3;
        if (!insideHexagon(cx - mx, cy - my, a)) continue;
        n++;
        const len = Math.hypot(cx - mx, cy - my) || 1;
        const turn = (jitter(n * 3.1) - 0.5) * 0.6;
        const ux = (cx - mx) / len;
        const uy = (cy - my) / len;
        out.push({
          points,
          cx,
          cy,
          edge: !insideHexagon(cx - mx, cy - my, a - ring),
          phase: jitter(n),
          hue: jitter(n * 7.7),
          diag: (cx - left + (cy - top)) / span,
          dx: ux * Math.cos(turn) - uy * Math.sin(turn),
          dy: ux * Math.sin(turn) + uy * Math.cos(turn),
          side,
        });
      }
    }
  }
  return out;
}

/** How long one sweep of the shimmer takes, and the rest before the next (seconds). */
export const SWEEP_S = 1.6;
export const SWEEP_REST_S = 2.2;

/** Ease in and out (quintic): it gathers slowly, rushes through the middle, and settles. */
function easeInOut(p: number): number {
  return p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2;
}

/**
 * The shimmer at time `t` (seconds) on a triangle: a bright band that sweeps from the top left to the
 * bottom right, then rests. 0 to 1.
 */
export function shardSweep(s: Shard, t: number): number {
  const cycle = SWEEP_S + SWEEP_REST_S;
  const into = t % cycle;
  if (into > SWEEP_S) return 0;
  // The band's middle runs from just before the top left corner to just past the bottom right one.
  const at = -0.2 + 1.4 * easeInOut(into / SWEEP_S);
  const d = (s.diag - at) / 0.12;
  return Math.exp(-d * d);
}

/**
 * How opaque a triangle is at time `t` (seconds): its own slow pulse (at the pattern's `speed`), the
 * sweep, and a brighter edge. `base` is the pattern's strength; the result stays below 0.45.
 */
export function shardAlpha(s: Shard, t: number, base: number, speed = 1): number {
  const pulse = 0.6 + 0.4 * Math.sin(t * speed * 1.6 + s.phase * Math.PI * 2);
  const a = base * pulse * (s.edge ? 1.6 : 1) + shardSweep(s, t) * 0.16;
  return Math.min(0.45, Math.max(0, a));
}

/** How far a triangle's colour has drifted from the theme's main colour toward its light one, 0 to 0.7. */
export function shardMix(s: Shard, t: number): number {
  return 0.35 + 0.35 * Math.sin(t * 0.9 + s.hue * Math.PI * 2);
}

/** Where a triangle is `p` (0 to 1) of the way through the shatter, and how far it has turned. */
export function shardScatter(s: Shard, p: number): { x: number; y: number; turn: number } {
  const out = 1 - (1 - p) ** 3;
  const reach = s.side * (1.5 + 3 * s.phase);
  return {
    x: s.cx + s.dx * reach * out,
    y: s.cy + s.dy * reach * out + s.side * 1.5 * p * p,
    turn: (s.hue - 0.5) * 5 * out,
  };
}
