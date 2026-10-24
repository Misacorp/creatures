import { useEffect, useRef } from 'preact/hooks';
import type { BarrierLook, BarrierPattern } from '../move-fx';
import type { BarrierState } from '../replay';
import { barrierShards, shardAlpha, shardMix, shardScatter, type Shard } from './barrier-shards';

/** How each pattern builds its shield: the triangles' side (CSS px), the shimmer's speed and strength. */
const PATTERN: Readonly<Record<BarrierPattern, { side: number; speed: number; alpha: number }>> = {
  glass: { side: 20, speed: 1, alpha: 0.16 },
  plates: { side: 26, speed: 0.6, alpha: 0.22 },
  thorns: { side: 16, speed: 1.4, alpha: 0.18 },
};

/**
 * The room around the dome on the canvas (CSS px, each side), so the pieces of a shatter fly free
 * instead of being cut at the dome's box. barrier.css widens the canvas by the same amount.
 */
const ROOM = 100;

/** How long the shatter plays: the pieces fly out and fade. */
const SHATTER_MS = 750;

/** "#rgb" or "#rrggbb" as [r, g, b], or null. */
function rgbOf(hex: string): [number, number, number] | null {
  const h = hex.trim();
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (long !== null)
    return [1, 2, 3].map((k) => parseInt(long[k] ?? '0', 16)) as [number, number, number];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h);
  if (short !== null) {
    return [1, 2, 3].map((k) => parseInt((short[k] ?? '0').repeat(2), 16)) as [
      number,
      number,
      number,
    ];
  }
  return null;
}

function draw(
  ctx: CanvasRenderingContext2D,
  shards: readonly Shard[],
  colours: { a: [number, number, number]; c: [number, number, number] },
  pattern: BarrierPattern,
  t: number,
  shatter: number | null,
): void {
  const { speed, alpha } = PATTERN[pattern];
  for (const s of shards) {
    const mix = shardMix(s, t * speed);
    const rgb = colours.a.map((v, k) => Math.round(v + ((colours.c[k] ?? v) - v) * mix));
    let a = shardAlpha(s, t * speed, alpha);
    ctx.save();
    if (shatter !== null) {
      const p = shardScatter(s, shatter);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.turn);
      ctx.translate(-s.cx, -s.cy);
      // A flash as it breaks, then the pieces fade as they fly.
      a = shatter < 0.12 ? Math.min(1, a * 4) : a * 2.2 * (1 - shatter);
    }
    ctx.fillStyle = `rgba(${rgb.join(', ')}, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(s.points[0], s.points[1]);
    ctx.lineTo(s.points[2], s.points[3]);
    ctx.lineTo(s.points[4], s.points[5]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * A see-through shield over the foe's picture while a lasting move is armed (Backdraft, Molten
 * Shell, the Thorns room: `BARRIER_OPS`). One component for all of them; `look` gives its colours
 * and its pattern (`barrierLookOf`). No border: it is built from small triangles whose opacity and
 * colour shift slowly, so it shimmers. When the first reaction meets it, it flashes and its
 * triangles fly out and fade. One small canvas, redrawn while it shows (a few dozen triangles);
 * with reduced motion it is drawn once and simply goes when broken. Decoration only (the move track
 * and the move's popover say what it does), so it is hidden from assistive technology. The stage
 * keys it by round and state, so it forms again each round and the shatter plays when it breaks.
 */
export function Barrier({ barrier, look }: { barrier: BarrierState; look: BarrierLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const broken = barrier.broken !== null;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null) return undefined;
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    ctx.scale(ratio, ratio);
    const css = getComputedStyle(canvas);
    const a = rgbOf(css.getPropertyValue('--a')) ?? [255, 255, 255];
    const c = rgbOf(css.getPropertyValue('--c')) ?? [255, 255, 255];
    const shards = barrierShards(
      box.width - ROOM * 2,
      box.height - ROOM * 2,
      PATTERN[look.pattern].side,
      look.pattern,
    );
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = (t: number, shatter: number | null): void => {
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.save();
      ctx.translate(ROOM, ROOM);
      draw(ctx, shards, { a, c }, look.pattern, t, shatter);
      ctx.restore();
    };
    if (still) {
      if (!broken) paint(0, null);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = (now - start) / 1000;
      if (broken) {
        const p = Math.min(1, (now - start) / SHATTER_MS);
        paint(t, p);
        if (p >= 1) return;
      } else {
        paint(t, null);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [broken, look.pattern, look.theme]);
  return (
    <canvas
      ref={ref}
      class={`barrier th-${look.theme} pat-${look.pattern}${broken ? ' broken' : ''}`}
      aria-hidden="true"
    />
  );
}
