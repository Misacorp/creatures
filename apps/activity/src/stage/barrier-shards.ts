/**
 * The triangles a barrier is built from (`Barrier.tsx`): a grid of equilateral triangles cut to a dome
 * over the foe, each with its own small, stable variation (from its index: no `Math.random`). Pure, so
 * the shapes and the motion are tested without a canvas.
 */
import type { BarrierPattern } from '../move-fx';

export interface Shard {
  /** The three corners, x and y in turn, in CSS px from the barrier's top left. */
  points: readonly [number, number, number, number, number, number];
  /** Its centre. */
  cx: number;
  cy: number;
  /** At the dome's edge: a little brighter, so the shape reads without a border. */
  edge: boolean;
  /** Two stable values in [0, 1): when it shimmers and how its colour drifts. */
  phase: number;
  hue: number;
  /** Where it flies when the barrier shatters: a unit direction away from the dome's middle. */
  dx: number;
  dy: number;
}

function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** The dome: round on top, straight sides, softly rounded bottom corners. `inset` shrinks it. */
export function insideDome(x: number, y: number, w: number, h: number, inset = 0): boolean {
  const hw = w / 2 - inset;
  const top = inset;
  const bottom = h - inset;
  if (hw <= 0 || bottom <= top) return false;
  const u = (x - w / 2) / hw;
  const v = (y - top) / (bottom - top);
  if (v < 0 || v > 1) return false;
  const shoulder = 0.65;
  if (v < shoulder) return u * u + ((v - shoulder) / shoulder) ** 2 <= 1;
  const corner = Math.max(0, (v - 0.75) / 0.25);
  return Math.abs(u) <= 1 - corner * corner * 0.4;
}

/** The triangles of a barrier `w` by `h` (CSS px), each `side` px across. */
export function barrierShards(
  w: number,
  h: number,
  side: number,
  pattern: BarrierPattern,
): Shard[] {
  const rh = (side * Math.sqrt(3)) / 2;
  const out: Shard[] = [];
  const mx = w / 2;
  const my = h * 0.55;
  let n = 0;
  for (let r = 0; r * rh < h; r++) {
    const y0 = r * rh;
    const off = (r % 2) * (side / 2) - side;
    for (let x = off; x < w + side; x += side) {
      for (const up of [true, false]) {
        const x0 = up ? x : x + side / 2;
        const points: Shard['points'] = up
          ? [x0, y0 + rh, x0 + side / 2, y0, x0 + side, y0 + rh]
          : [x0, y0, x0 + side, y0, x0 + side / 2, y0 + rh];
        const cx = x0 + side / 2;
        const cy = up ? y0 + (rh * 2) / 3 : y0 + rh / 3;
        if (!insideDome(cx, cy, w, h)) continue;
        n++;
        const len = Math.hypot(cx - mx, cy - my) || 1;
        const turn = (jitter(n * 3.1) - 0.5) * 0.6;
        const ux = (cx - mx) / len;
        const uy = (cy - my) / len;
        out.push({
          points,
          cx,
          cy,
          edge: !insideDome(cx, cy, w, h, pattern === 'plates' ? side * 0.9 : side * 1.1),
          phase: jitter(n),
          hue: jitter(n * 7.7),
          dx: ux * Math.cos(turn) - uy * Math.sin(turn),
          dy: ux * Math.sin(turn) + uy * Math.cos(turn),
        });
      }
    }
  }
  return out;
}

/**
 * How opaque a triangle is at time `t` (seconds): its own slow pulse, a glint that sweeps across the
 * dome now and then, and a brighter edge. `base` is the pattern's strength; the result stays below 0.5.
 */
export function shardAlpha(s: Shard, t: number, base: number): number {
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.6 + s.phase * Math.PI * 2);
  const glint = Math.max(0, Math.sin(t * 0.8 - s.cx / 30)) ** 12;
  const a = base * pulse * (s.edge ? 1.7 : 1) + glint * 0.18;
  return Math.min(0.5, Math.max(0, a));
}

/** How far a triangle's colour has drifted from the theme's main colour toward its light one, 0 to 0.7. */
export function shardMix(s: Shard, t: number): number {
  return 0.35 + 0.35 * Math.sin(t * 0.9 + s.hue * Math.PI * 2);
}

/** Where a triangle is `p` (0 to 1) of the way through the shatter, and how far it has turned. */
export function shardScatter(s: Shard, p: number): { x: number; y: number; turn: number } {
  const out = 1 - (1 - p) ** 3;
  const reach = 18 + 34 * s.phase;
  return {
    x: s.cx + s.dx * reach * out,
    y: s.cy + s.dy * reach * out + 22 * p * p,
    turn: (s.hue - 0.5) * 5 * out,
  };
}
