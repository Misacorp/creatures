import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Zone } from '@creatures/engine';
import { reticleTargets, strikeRows, type BossStrike } from '../stage';

/**
 * The boss's attacks in flight (decisions.md, 2026-10-22): what flies from the boss to its targets
 * while the attack winds up, so it lands exactly when the hit does (the white flash and the numbers
 * are the stage's own). Everything is drawn by CSS shapes tinted with the boss's element
 * (`--shot`, set on the strike layer) and moved with the Web Animations API: no image files.
 *
 * - `arc`: a glowing crescent that glides along a slight curve, like a boomerang (the plain attack,
 *   a strike on the strongest, a slam, a reflected hit); a chain's jumps go from one creature to the
 *   next.
 * - `wave`: a tall crescent that sweeps across a whole row (a zone hit, a sweep, the enrage round).
 * - `rain`: orbs falling from above onto each creature (a barrage; a charged barrage when it lands).
 * - `spear`: a long bolt from the boss straight down a lane (a lance).
 * - `pincer`: two crescents closing in from both ends of a row.
 * - `hex`: a violet crescent (a silence).
 *
 * Each shot ends in an impact ring on its target. Nothing is drawn with reduced motion: the
 * reticles and the landed marks say it all.
 */
export type ShotKind = 'arc' | 'wave' | 'rain' | 'spear' | 'pincer' | 'hex';

/** One thing that flies: from the boss (null), a creature or a row's edge, to a creature or a row. */
export interface ShotSpec {
  kind: ShotKind;
  from: string | null;
  /** A creature's id, or a row (`front`, `middle`, `back`) when `row` is set. */
  to: string;
  /** `to` is a row (a wave). */
  row?: boolean;
  /** Which way a curve bends, and from which side a pincer comes: -1 or 1. */
  side: number;
  /** How much later than the first shot this one starts, in shares of the flight (0 to 0.6). */
  lag: number;
}

/** The longest a shot flies: in a slow wind-up the reticles show first and the shot comes late. */
export const MAX_FLIGHT_MS = 900;

/** A small stable number from 0 to 1 for a shot (no `Math.random`: the same fight looks the same). */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** What flies for one boss action. Pure, so it is tested without a page. */
export function shotsOf(strike: BossStrike): ShotSpec[] {
  const targets = reticleTargets(strike);
  const rows = strikeRows(strike);
  if (strike.action === 'enrage' || (rows.length > 0 && strike.action !== 'charge')) {
    return rows.map((zone, k) => ({
      kind: 'wave',
      from: null,
      to: zone,
      row: true,
      side: 1,
      lag: k * 0.15,
    }));
  }
  switch (strike.action) {
    case 'barrage':
      return targets.map((to, k) => ({
        kind: 'rain',
        from: null,
        to,
        side: 1,
        lag: Math.min(0.6, k * 0.1),
      }));
    case 'charge':
      // The announcement: its marks say who it will hit; it flies when it lands (as its pattern).
      return [];
    case 'lance': {
      const last = targets[targets.length - 1];
      return last === undefined ? [] : [{ kind: 'spear', from: null, to: last, side: 1, lag: 0 }];
    }
    case 'pincer':
      return targets.map((to, k) => ({
        kind: 'pincer',
        from: null,
        to,
        side: k % 2 === 0 ? -1 : 1,
        lag: 0,
      }));
    case 'silence_ends':
      return targets.map((to, k) => ({
        kind: 'hex',
        from: null,
        to,
        side: k % 2 === 0 ? -1 : 1,
        lag: k * 0.12,
      }));
    case 'strike_highest_atk':
      // A chain: the first strike from the boss, each jump from the creature before it.
      return targets.slice(0, 4).map((to, k) => ({
        kind: 'arc',
        from: k === 0 ? null : (targets[k - 1] ?? null),
        to,
        side: k % 2 === 0 ? 1 : -1,
        lag: Math.min(0.6, k * 0.2),
      }));
    case 'reflect_armed':
      return [];
    default:
      return targets.slice(0, 6).map((to, k) => ({
        kind: 'arc',
        from: null,
        to,
        side: k % 2 === 0 ? 1 : -1,
        lag: Math.min(0.6, k * 0.08),
      }));
  }
}

interface Point {
  x: number;
  y: number;
}

const centre = (r: DOMRect, base: DOMRect, at = 0.5): Point => ({
  x: r.left + r.width / 2 - base.left,
  y: r.top + r.height * at - base.top,
});

/** A quadratic curve from `a` to `b`, bent sideways by `bend` times its length. */
function curve(a: Point, b: Point, bend: number, steps: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend };
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    };
  });
}

/** Keyframes that move an element along `points`, turned to face where it goes. */
function along(points: Point[], scaleFrom: number, scaleTo: number): Keyframe[] {
  return points.map((p, k) => {
    const next = points[Math.min(k + 1, points.length - 1)] as Point;
    const prev = points[Math.max(k - 1, 0)] as Point;
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    const t = k / (points.length - 1);
    return {
      transform: `translate(${String(p.x)}px, ${String(p.y)}px) rotate(${String(angle)}rad) scale(${String(scaleFrom + (scaleTo - scaleFrom) * t)})`,
      opacity: t < 0.12 ? t / 0.12 : 1,
    };
  });
}

/**
 * The shots of one boss action, flying during its wind-up (`ms`, the wind-up's own length). They
 * are measured and started once, before the first paint, then left to the browser.
 */
export function BossShots({
  strike,
  seed,
  ms,
  layer,
  boss,
  unit,
  zone,
}: {
  strike: BossStrike;
  /** The event index of the action, for the small stable variations. */
  seed: number;
  ms: number;
  layer: RefObject<HTMLElement | null>;
  boss: () => HTMLElement | null;
  unit: (id: string) => HTMLElement | null;
  zone: (zone: Zone) => HTMLElement | null;
}) {
  const shots = shotsOf(strike);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const impacts = useRef<(HTMLSpanElement | null)[]>([]);
  useLayoutEffect(() => {
    const base = layer.current?.getBoundingClientRect();
    const bossBox = boss()?.getBoundingClientRect();
    if (base === undefined || bossBox === undefined) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const flight = Math.min(ms, MAX_FLIGHT_MS);
    const start = Math.max(0, ms - flight);
    const running: Animation[] = [];
    shots.forEach((shot, k) => {
      const el = refs.current[k];
      const hit = impacts.current[k];
      if (el === null || el === undefined || typeof el.animate !== 'function') return;
      const toEl = shot.row === true ? zone(shot.to as Zone) : unit(shot.to);
      const toBox = toEl?.getBoundingClientRect();
      if (toBox === undefined) return;
      const fromBox = shot.from === null ? bossBox : unit(shot.from)?.getBoundingClientRect();
      if (fromBox === undefined) return;
      const delay = start + shot.lag * flight * 0.5;
      const duration = flight * (1 - shot.lag * 0.5);
      const end = centre(toBox, base);
      let frames: Keyframe[];
      switch (shot.kind) {
        case 'wave': {
          el.style.setProperty('--h', `${String(Math.round(toBox.height * 1.15))}px`);
          const y = end.y;
          frames = [
            {
              transform: `translate(${String(toBox.left - base.left - 30)}px, ${String(y)}px) scaleX(0.6)`,
              opacity: 0,
            },
            {
              transform: `translate(${String(toBox.left - base.left)}px, ${String(y)}px) scaleX(1)`,
              opacity: 1,
              offset: 0.15,
            },
            {
              transform: `translate(${String(toBox.right - base.left)}px, ${String(y)}px) scaleX(1.3)`,
              opacity: 1,
              offset: 0.9,
            },
            {
              transform: `translate(${String(toBox.right - base.left + 20)}px, ${String(y)}px) scaleX(1.5)`,
              opacity: 0,
            },
          ];
          break;
        }
        case 'rain': {
          const x = end.x + (jitter(seed * 7 + k) - 0.5) * 40;
          frames = along([{ x, y: -30 }, { x: (x + end.x) / 2, y: end.y / 2 }, end], 0.7, 1.15);
          break;
        }
        case 'spear': {
          const a = centre(bossBox, base, 0.75);
          const len = Math.hypot(end.x - a.x, end.y - a.y);
          const angle = Math.atan2(end.y - a.y, end.x - a.x);
          el.style.setProperty('--len', `${String(Math.round(len))}px`);
          frames = [
            {
              transform: `translate(${String(a.x)}px, ${String(a.y)}px) rotate(${String(angle)}rad) scaleX(0)`,
              opacity: 0,
            },
            {
              transform: `translate(${String(a.x)}px, ${String(a.y)}px) rotate(${String(angle)}rad) scaleX(0.2)`,
              opacity: 1,
              offset: 0.55,
            },
            {
              transform: `translate(${String(a.x)}px, ${String(a.y)}px) rotate(${String(angle)}rad) scaleX(1)`,
              opacity: 1,
            },
          ];
          break;
        }
        case 'pincer': {
          const edge = zone(strike.zone ?? 'front')?.getBoundingClientRect() ?? base;
          const sx = shot.side < 0 ? edge.left - base.left - 20 : edge.right - base.left + 20;
          frames = along(curve({ x: sx, y: end.y - 40 }, end, 0.25 * shot.side, 10), 0.8, 1.1);
          break;
        }
        default: {
          const a = shot.from === null ? centre(fromBox, base, 0.7) : centre(fromBox, base);
          const bend = (0.18 + jitter(seed + k) * 0.12) * shot.side;
          frames = along(curve(a, end, bend, 14), shot.from === null ? 0.55 : 0.8, 1.15);
        }
      }
      running.push(
        el.animate(frames, {
          duration,
          delay,
          easing: 'cubic-bezier(0.45, 0, 0.75, 1)',
          fill: 'both',
        }),
      );
      if (hit !== null && hit !== undefined && typeof hit.animate === 'function') {
        running.push(
          hit.animate(
            [
              {
                transform: `translate(${String(end.x)}px, ${String(end.y)}px) scale(0.3)`,
                opacity: 1,
              },
              {
                transform: `translate(${String(end.x)}px, ${String(end.y)}px) scale(${shot.row === true ? '2.4' : '1.6'})`,
                opacity: 0,
              },
            ],
            { duration: 380, delay: delay + duration - 20, easing: 'ease-out', fill: 'both' },
          ),
        );
      }
    });
    return () => {
      for (const a of running) a.cancel();
    };
  }, []);
  return (
    <>
      {shots.map((shot, k) => (
        <span key={`s${String(k)}`} aria-hidden="true">
          <span
            class={`shot shot-${shot.kind}`}
            ref={(el) => {
              refs.current[k] = el;
            }}
          />
          <span
            class={`shot-impact${shot.row === true ? ' wide' : ''}${shot.kind === 'hex' ? ' hex' : ''}`}
            ref={(el) => {
              impacts.current[k] = el;
            }}
          />
        </span>
      ))}
    </>
  );
}
