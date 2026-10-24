/**
 * Plays a boss action's animation (`move-fx.ts` says which): the first half during the wind-up, so it
 * lands exactly when the hit does, and the second half from the moment it lands (the splash, the
 * shatter, the vines holding on, the row shaking). Decoration only: it makes a few small elements in
 * the stage's strike layer, moves them with the Web Animations API and removes them again; it also
 * shakes the creatures' own boxes. Pixel style: hard edges, no glows. The big things that fly (the
 * crescent, the boulder, the blob) are pixel art (`fx-sprites.ts`) drawn on a small canvas in the
 * theme's colours; the rest are CSS shapes (`styles/stage/boss-fx.css`) tinted by a theme class. No
 * image files, no `Math.random` (small stable variations come from the action's event index).
 */
import type { Zone } from '@creatures/engine';
import type { FxPlan, FxTheme } from '../move-fx';
import { parseSprite, swapPalette, type SpriteDef } from '../sprites/sprite-data';
import { BLOB, CRESCENT, ROCK } from './fx-sprites';

/** What the player needs from the stage. */
export interface FxStage {
  /** The strike layer: everything is drawn in it, in its own coordinates. */
  layer: HTMLElement;
  boss: HTMLElement | null;
  unit: (id: string) => HTMLElement | null;
  zone: (zone: Zone) => HTMLElement | null;
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** The longest the first half plays: in a slow wind-up the reticles show first. */
export const MAX_WINDUP_FX_MS = 1_000;

function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** The particle that goes with a theme (an ember for fire, a drop for water...). */
const BIT: Record<FxTheme, string> = {
  water: 'drop',
  fire: 'ember',
  lava: 'ember',
  vine: 'leaf',
  thorn: 'thorn',
  seed: 'seed',
  lightning: 'spark',
  mud: 'blob',
  tar: 'blob',
  mist: 'puff',
  metal: 'chip',
  swarm: 'dot',
  bubble: 'bubble',
};

/** One playing animation: its elements and their animations, removed and cancelled together. */
class Scene {
  private readonly made: HTMLElement[] = [];
  private readonly made2: SVGElement[] = [];
  private readonly running: Animation[] = [];
  readonly base: DOMRect;

  constructor(
    readonly stage: FxStage,
    readonly plan: FxPlan,
    readonly seed: number,
  ) {
    this.base = stage.layer.getBoundingClientRect();
  }

  box(el: Element | null): Box | null {
    const r = el?.getBoundingClientRect();
    if (r === undefined) return null;
    const x = r.left - this.base.left;
    const y = r.top - this.base.top;
    return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
  }

  get bossBox(): Box | null {
    return this.box(this.stage.boss);
  }

  /** Where the boss's attacks leave it: the lower middle of its picture. */
  get mouth(): Point | null {
    const b = this.bossBox;
    return b === null ? null : { x: b.cx, y: b.y + b.h * 0.72 };
  }

  target(id: string): Box | null {
    // The creature's picture, not its whole tile with its name.
    const unit = this.stage.unit(id);
    return this.box(unit?.querySelector('.unit-art') ?? unit);
  }

  targets(): Box[] {
    return this.plan.targets.flatMap((id) => {
      const b = this.target(id);
      return b === null ? [] : [b];
    });
  }

  rowBoxes(): Box[] {
    return this.plan.rows.flatMap((z) => {
      const b = this.box(this.stage.zone(z));
      return b === null ? [] : [b];
    });
  }

  spawn(cls: string, at: Point = { x: 0, y: 0 }): HTMLElement {
    const el = document.createElement('span');
    el.className = `fx ${cls} th-${this.plan.theme}${this.plan.big ? ' big' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.style.transform = `translate(${px(at.x)}, ${px(at.y)})`;
    this.stage.layer.append(el);
    this.made.push(el);
    return el;
  }

  /**
   * A piece of pixel art in the theme's colours (read from the theme class, so the colours live in
   * one place), centred on `at`. `ghost` also draws a faint copy behind it, `ghost` pixels back: the
   * trail of something fast.
   */
  pixel(cls: string, def: SpriteDef, scale: number, at: Point, ghost = 0): HTMLElement {
    const el = this.spawn(`fx-px ${cls}`, at);
    const css = getComputedStyle(el);
    const colour = (name: string, fallback: string): string => {
      const v = css.getPropertyValue(name).trim();
      return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v) ? v : fallback;
    };
    const sprite = parseSprite(
      swapPalette(def, {
        a: colour('--a', '#888888'),
        b: colour('--b', '#333333'),
        c: colour('--c', '#ffffff'),
      }),
    );
    const w = (sprite.width + ghost) * scale;
    const h = sprite.height * scale;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      for (const [dx, alpha] of ghost > 0
        ? ([
            [0, 0.35],
            [ghost, 1],
          ] as const)
        : ([[0, 1]] as const)) {
        ctx.globalAlpha = alpha;
        for (const cell of sprite.cells) {
          ctx.fillStyle = cell.colour;
          ctx.fillRect((cell.x + dx) * scale, cell.y * scale, scale, scale);
        }
      }
    }
    el.style.width = px(w);
    el.style.height = px(h);
    // Centred on its point, the trail behind (to the left: everything flies turned to face right).
    el.style.margin = `${px(-h / 2)} 0 0 ${px(-(w + ghost * scale) / 2)}`;
    el.append(canvas);
    return el;
  }

  /** Small embers (or other bits) standing in a circle `d` across, in one element that can turn. */
  orbit(at: Point, d: number, count: number, cls = 'ember'): HTMLElement {
    const el = this.spawn('fx-orbit', at);
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2;
      const bit = document.createElement('i');
      bit.className = `fx-bit bit-${cls}${k % 3 === 0 ? ' hot' : ''}`;
      bit.style.transform = `translate(${px((Math.cos(angle) * d) / 2)}, ${px((Math.sin(angle) * d) / 2)}) rotate(45deg)`;
      el.append(bit);
    }
    return el;
  }

  /** A jagged bolt of lightning through `points` (an SVG line, made here, never parsed from text). */
  bolt(points: Point[], width: number): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', `fx fx-bolt th-${this.plan.theme}`);
    svg.setAttribute('width', String(Math.ceil(this.base.width)));
    svg.setAttribute('height', String(Math.ceil(this.base.height)));
    const make = (cls: string, w: number): void => {
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute(
        'points',
        points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      );
      line.setAttribute('class', cls);
      line.setAttribute('stroke-width', String(w));
      svg.append(line);
    };
    make('bolt-edge', width * 2.2);
    make('bolt-core', width);
    this.stage.layer.append(svg);
    this.made2.push(svg);
    return svg;
  }

  run(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): void {
    if (typeof (el as HTMLElement).animate !== 'function') return;
    this.running.push((el as HTMLElement).animate(frames, { fill: 'both', ...opts }));
  }

  stop(): void {
    for (const a of this.running) a.cancel();
    for (const el of this.made) el.remove();
    for (const el of this.made2) el.remove();
  }

  // ---- shared pieces ----

  /** Bits flying out from `at` and falling a little: a shatter, a splash, sparks. */
  shards(
    at: Point,
    count: number,
    reach: number,
    delay: number,
    seed: number,
    cls = BIT[this.plan.theme],
  ): void {
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + jitter(seed + k) * 0.8;
      const dist = reach * (0.6 + jitter(seed * 3 + k) * 0.6);
      const end = { x: at.x + Math.cos(angle) * dist, y: at.y + Math.sin(angle) * dist * 0.7 };
      const el = this.spawn(`fx-bit bit-${cls}`, at);
      const spin = (jitter(seed + k * 7) - 0.5) * 540;
      this.run(
        el,
        [
          { transform: `translate(${px(at.x)}, ${px(at.y)}) rotate(0deg) scale(1)`, opacity: 1 },
          {
            transform: `translate(${px(end.x)}, ${px(end.y)}) rotate(${String(spin / 2)}deg) scale(0.9)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate(${px(end.x)}, ${px(end.y + reach * 0.35)}) rotate(${String(spin)}deg) scale(0.5)`,
            opacity: 0,
          },
        ],
        { duration: 650, delay, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      );
    }
  }

  /** A ring that bursts outwards on an impact. */
  ring(at: Point, size: number, delay: number): void {
    const el = this.spawn('fx-ring', at);
    this.run(
      el,
      [
        { transform: `translate(${px(at.x)}, ${px(at.y)}) scale(0.2)`, opacity: 1 },
        { transform: `translate(${px(at.x)}, ${px(at.y)}) scale(${String(size)})`, opacity: 0 },
      ],
      { duration: 420, delay, easing: 'steps(5, end)' },
    );
  }

  /** Shakes the creatures with these ids from side to side (their own boxes). */
  shake(ids: readonly string[], delay: number, strength: number, duration = 650): void {
    ids.forEach((id, k) => {
      const el = this.stage.unit(id);
      if (el === null) return;
      const s = strength;
      this.run(
        el,
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(${px(-s)})` },
          { transform: `translateX(${px(s)})` },
          { transform: `translateX(${px(-s * 0.7)})` },
          { transform: `translateX(${px(s * 0.7)})` },
          { transform: `translateX(${px(-s * 0.35)})` },
          { transform: 'translateX(0)' },
        ],
        { duration, delay: delay + (k % 4) * 25, easing: 'linear', fill: 'none' },
      );
    });
  }

  /** Something that flies along `points`, turned to face where it goes (a class, or a maker for pixel art). */
  fly(
    what: string | ((at: Point) => HTMLElement),
    points: Point[],
    duration: number,
    delay: number,
    scale: [number, number],
    turn = true,
    spin = 0,
  ): void {
    const start = points[0] as Point;
    const el = typeof what === 'string' ? this.spawn(what, start) : what(start);
    const frames = points.map((p, k) => {
      const next = points[Math.min(k + 1, points.length - 1)] as Point;
      const prev = points[Math.max(k - 1, 0)] as Point;
      const t = k / (points.length - 1);
      const angle = turn ? Math.atan2(next.y - prev.y, next.x - prev.x) : 0;
      const s = scale[0] + (scale[1] - scale[0]) * t;
      return {
        transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(angle + spin * t)}rad) scale(${String(s)})`,
        opacity: t < 0.1 ? t / 0.1 : 1,
      };
    });
    this.run(el, frames, { duration, delay, easing: 'cubic-bezier(0.45, 0, 0.7, 1)' });
    // Gone on arrival: the impact takes over.
    this.run(el, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 60,
      delay: delay + duration,
      fill: 'forwards',
    });
  }
}

const px = (n: number): string => `${n.toFixed(1)}px`;

/** A quadratic curve from `a` to `b` through a point lifted by `lift` and bent sideways by `bend`. */
function curve(a: Point, b: Point, bend: number, lift: number, steps = 14): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend - lift };
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    };
  });
}

/** A jagged line from `a` to `b` for a bolt of lightning. */
function jagged(a: Point, b: Point, seed: number, roughness: number): Point[] {
  const steps = 7;
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const off = k === 0 || k === steps ? 0 : (jitter(seed + k * 13) - 0.5) * roughness;
    return {
      x: a.x + (b.x - a.x) * t + (nx / len) * off,
      y: a.y + (b.y - a.y) * t + (ny / len) * off,
    };
  });
}

/**
 * Water, mud or lava rising under a row: a band whose top is a stepped pixel wave (its outline cut in
 * whole steps, so it reads as pixel art), see-through so the creatures and the numbers show.
 */
function surge(s: Scene, row: Box, big: boolean): HTMLElement {
  const w = row.w + 16;
  const h = row.h * (big ? 1.25 : 1.05);
  const el = s.spawn('fx-surge', { x: row.x, y: row.y + row.h });
  el.style.setProperty('--w', px(w));
  el.style.setProperty('--h', px(h));
  const step = 6;
  const crest = [0, 3, 6, 9, 6, 3];
  const points: string[] = [];
  for (let x = 0, k = 0; x < w; x += step, k++) {
    const y = crest[k % crest.length] ?? 0;
    points.push(`${px(x)} ${px(y)}`, `${px(Math.min(w, x + step))} ${px(y)}`);
  }
  points.push(`${px(w)} ${px(h)}`, `0 ${px(h)}`);
  el.style.clipPath = `polygon(${points.join(', ')})`;
  return el;
}

const centre = (b: Box): Point => ({ x: b.cx, y: b.cy });
const feet = (b: Box): Point => ({ x: b.cx, y: b.y + b.h });

/**
 * The first half of a boss action, during its wind-up (`ms` long): what flies or gathers before the
 * hit. Returns the function that stops it.
 */
export function playWindup(stage: FxStage, plan: FxPlan, ms: number, seed: number): () => void {
  const s = new Scene(stage, plan, seed);
  const span = Math.min(ms, MAX_WINDUP_FX_MS);
  const at = Math.max(0, ms - span);
  const mouth = s.mouth;
  const targets = s.targets();
  if (mouth === null) return () => s.stop();
  switch (plan.recipe) {
    case 'crescent':
      targets.slice(0, 6).forEach((t, k) => {
        s.fly(
          (p) => s.pixel('fx-crescent', CRESCENT, 3, p, 4),
          curve(mouth, centre(t), (k % 2 === 0 ? 1 : -1) * 0.08, 0),
          span * 0.9,
          at + k * 40,
          [0.7, 1.05],
        );
      });
      break;
    case 'backlash': {
      // The barrier bursts (its pieces fly off the boss), and the reaction comes back as a bolt.
      const b = s.bossBox;
      if (b !== null) s.shards(centre(b), 12, Math.max(b.w, b.h) * 0.7, at, seed);
      targets.slice(0, 1).forEach((t) => {
        s.fly(
          (p) => s.pixel('fx-blob', BLOB, 3, p, 3),
          curve(centre(b ?? t), centre(t), 0.12, 30, 14),
          span * 0.75,
          at + span * 0.25,
          [0.8, 1.2],
        );
      });
      break;
    }
    case 'whip': {
      let from = mouth;
      targets.slice(0, 4).forEach((t, k) => {
        const part = span / Math.max(1, Math.min(4, targets.length));
        s.fly(
          'fx-thornwhip',
          curve(from, centre(t), (k % 2 === 0 ? 1 : -1) * 0.15, 0),
          part,
          at + k * part,
          [0.8, 1.1],
        );
        from = centre(t);
      });
      break;
    }
    case 'jet': {
      const last = targets[targets.length - 1];
      if (last === undefined) break;
      const end = centre(last);
      const el = s.spawn('fx-jet', mouth);
      const len = Math.hypot(end.x - mouth.x, end.y - mouth.y);
      const angle = Math.atan2(end.y - mouth.y, end.x - mouth.x);
      el.style.setProperty('--len', px(len));
      s.run(
        el,
        [
          {
            transform: `translate(${px(mouth.x)}, ${px(mouth.y)}) rotate(${String(angle)}rad) scaleX(0)`,
            opacity: 0.4,
          },
          {
            transform: `translate(${px(mouth.x)}, ${px(mouth.y)}) rotate(${String(angle)}rad) scaleX(1)`,
            opacity: 1,
          },
        ],
        { duration: span * 0.8, delay: at + span * 0.2, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
      );
      break;
    }
    case 'rain':
      targets.forEach((t, k) => {
        const end = centre(t);
        const from = { x: end.x - 40 + jitter(seed + k) * 30, y: -20 };
        const part = span * 0.55;
        s.fly(
          `fx-bit bit-${BIT[plan.theme]} falling`,
          curve(from, end, 0, 0, 6),
          part,
          at + (span - part) * jitter(seed * 5 + k),
          [0.9, 1.3],
        );
      });
      break;
    case 'mortar':
      targets.slice(0, 6).forEach((t, k) => {
        s.fly(
          (p) => s.pixel('fx-blob', BLOB, 3, p),
          curve(mouth, centre(t), 0, 90, 16),
          span * 0.9,
          at + k * 60,
          [0.6, 1.4],
          false,
          6,
        );
      });
      break;
    case 'meteor':
      targets.slice(0, 3).forEach((t, k) => {
        const end = centre(t);
        const from = { x: end.x - 140, y: -60 - k * 20 };
        s.fly(
          (p) => s.pixel('fx-meteor', ROCK, 4, p),
          curve(from, end, 0, 0, 8),
          span * 0.75,
          at + span * 0.25 + k * 60,
          [0.7, 1.1],
        );
      });
      break;
    case 'skybolt':
      targets.slice(0, 3).forEach((t) => {
        const cloud = s.spawn('fx-cloud', { x: t.cx, y: 6 });
        s.run(
          cloud,
          [
            { transform: `translate(${px(t.cx)}, 6px) scale(0.3)`, opacity: 0 },
            { transform: `translate(${px(t.cx)}, 6px) scale(1)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${px(t.cx)}, 6px) scale(1.1)`, opacity: 0.6, offset: 0.7 },
            { transform: `translate(${px(t.cx)}, 6px) scale(1.2)`, opacity: 1 },
          ],
          { duration: span, delay: at },
        );
      });
      break;
    case 'chain':
    case 'static': {
      // Charge gathers: a spark at the boss (a chain) or on each creature of the row (static).
      const points = plan.recipe === 'chain' ? [mouth] : targets.map(centre);
      points.slice(0, 8).forEach((p, k) => {
        const el = s.spawn('fx-bit bit-spark', p);
        s.run(
          el,
          [
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(0.2)`, opacity: 0 },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.6)`, opacity: 1, offset: 0.5 },
            {
              transform: `translate(${px(p.x)}, ${px(p.y)}) scale(0.9)`,
              opacity: 0.6,
              offset: 0.75,
            },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.8)`, opacity: 1 },
          ],
          { duration: span * 0.6, delay: at + span * 0.4 + k * 20 },
        );
      });
      break;
    }
    case 'vines':
    case 'bubbles':
      // The ground cracks under each target.
      targets.forEach((t, k) => {
        const p = feet(t);
        const el = s.spawn('fx-crack', p);
        s.run(
          el,
          [
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scaleX(0)`, opacity: 0 },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scaleX(1)`, opacity: 1 },
          ],
          { duration: span * 0.6, delay: at + span * 0.4 + k * 30 },
        );
        if (plan.recipe === 'bubbles') {
          for (let b = 0; b < 3; b++) {
            const from = { x: t.cx - 12 + b * 12, y: t.y + t.h + 14 };
            s.fly(
              'fx-bit bit-bubble',
              curve(from, { x: from.x + (jitter(seed + b) - 0.5) * 10, y: t.cy }, 0, 0, 6),
              span * 0.7,
              at + span * 0.3 * jitter(seed * 9 + k + b),
              [0.6, 1.3],
              false,
            );
          }
        }
      });
      break;
    case 'pincer':
      s.rowBoxes()
        .slice(0, 1)
        .forEach((row) => {
          const first = targets[0];
          const last = targets[targets.length - 1] ?? first;
          if (first === undefined || last === undefined) return;
          for (const [edge, t, dir] of [
            [row.x - 8, first, 1],
            [row.x + row.w + 8, last, -1],
          ] as const) {
            const y = t.cy;
            const len = Math.abs(t.cx - edge);
            const el = s.spawn(`fx-vine-h${dir < 0 ? ' flip' : ''}`, { x: edge, y });
            el.style.setProperty('--len', px(len));
            s.run(
              el,
              [
                { transform: `translate(${px(edge)}, ${px(y)}) scaleX(${dir < 0 ? -0.01 : 0.01})` },
                { transform: `translate(${px(edge)}, ${px(y)}) scaleX(${dir < 0 ? -1 : 1})` },
              ],
              {
                duration: span * 0.85,
                delay: at + span * 0.15,
                easing: 'cubic-bezier(0.3, 0, 0.8, 0.6)',
              },
            );
          }
        });
      break;
    case 'surge':
      s.rowBoxes().forEach((row, k) => {
        const el = surge(s, row, plan.big);
        s.run(
          el,
          [
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(0)`,
              opacity: 0.4,
            },
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(0.7)`,
              opacity: 0.5,
            },
          ],
          {
            duration: span * 0.85,
            delay: at + span * 0.15 + k * 80,
            easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)',
          },
        );
      });
      break;
    case 'swarm':
      targets.slice(0, 6).forEach((t, k) => {
        for (let d = 0; d < 5; d++) {
          const wob = curve(mouth, centre(t), (jitter(seed + k * 5 + d) - 0.5) * 0.6, 0, 10);
          s.fly('fx-bit bit-dot', wob, span * 0.85, at + d * 35 + k * 30, [1, 1], false);
        }
      });
      break;
    case 'constrict':
      targets.slice(0, 3).forEach((t) => {
        const p = centre(t);
        const el = s.orbit(p, Math.max(t.w, t.h) * 1.3, 12);
        s.run(
          el,
          [
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(3) rotate(0deg)`, opacity: 0 },
            {
              transform: `translate(${px(p.x)}, ${px(p.y)}) scale(2) rotate(120deg)`,
              opacity: 1,
              offset: 0.3,
            },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1) rotate(360deg)`, opacity: 1 },
          ],
          { duration: span, delay: at, easing: 'cubic-bezier(0.5, 0, 0.9, 0.7)' },
        );
      });
      break;
    case 'flop': {
      const boss = stage.boss;
      if (boss !== null) {
        s.run(
          boss,
          [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(-1.5rem) scale(1.08, 0.95)', offset: 0.6 },
            { transform: 'translateY(-1.75rem) scale(1.1)' },
          ],
          {
            duration: span,
            delay: at,
            easing: 'ease-out',
          },
        );
      }
      targets.slice(0, 1).forEach((t) => {
        const p = feet(t);
        const el = s.spawn('fx-shadow', p);
        s.run(
          el,
          [
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(0.2)`, opacity: 0 },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(2.2)`, opacity: 0.7 },
          ],
          { duration: span, delay: at, easing: 'ease-in' },
        );
      });
      break;
    }
    default:
      break;
  }
  return () => s.stop();
}

/** The second half of a boss action, from the moment it lands. Returns the function that stops it. */
export function playImpact(stage: FxStage, plan: FxPlan, seed: number): () => void {
  const s = new Scene(stage, plan, seed);
  const targets = s.targets();
  const hit = plan.targets;
  const big = plan.big ? 1.4 : 1;
  switch (plan.recipe) {
    case 'backlash':
      targets.slice(0, 1).forEach((t) => {
        s.ring(centre(t), 2 * big, 0);
        s.shards(centre(t), 8, 36, 0, seed);
      });
      s.shake(hit, 0, 5, 500);
      break;
    case 'crescent':
    case 'whip':
      targets.slice(0, 6).forEach((t, k) => {
        s.ring(centre(t), 1.6, k * 30);
        s.shards(centre(t), 3, 22, k * 30, seed + k);
      });
      s.shake(hit, 0, 3, 350);
      break;
    case 'jet':
      targets.forEach((t, k) => {
        s.ring(centre(t), 1.5 * big, k * 50);
        s.shards(centre(t), 5, 30, k * 50, seed + k);
      });
      s.shake(hit, 0, 4);
      break;
    case 'rain':
      targets.forEach((t, k) => {
        s.ring(centre(t), 1.2 * big, k * 15);
        s.shards(centre(t), 3, 20 * big, k * 15, seed + k);
      });
      s.shake(hit, 0, 3, 400);
      break;
    case 'mortar':
      targets.slice(0, 6).forEach((t, k) => {
        const p = centre(t);
        const splat = s.spawn('fx-splat', p);
        s.run(
          splat,
          [
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(0.3, 0.3)`, opacity: 1 },
            {
              transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.6, 0.8)`,
              opacity: 1,
              offset: 0.3,
            },
            { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.8, 0.7)`, opacity: 0 },
          ],
          { duration: 700, delay: k * 40 },
        );
        s.shards(p, 6, 34, k * 40, seed + k);
      });
      s.shake(hit, 0, 4);
      break;
    case 'meteor':
    case 'flop':
    case 'constrict':
      targets.slice(0, 3).forEach((t, k) => {
        const p = centre(t);
        s.ring(p, 2.4 * big, k * 40);
        s.shards(p, 10, 54 * big, k * 40, seed + k, plan.recipe === 'constrict' ? 'ember' : 'rock');
      });
      s.shake(hit, 0, 7);
      s.shake(plan.splash, 60, 4);
      if (plan.recipe === 'flop' && stage.boss !== null) {
        s.run(
          stage.boss,
          [
            { transform: 'translateY(-1.75rem) scale(1.1)' },
            { transform: 'translateY(0.375rem) scale(1.15, 0.85)', offset: 0.25 },
            { transform: 'translateY(0) scale(1)' },
          ],
          {
            duration: 520,
            easing: 'cubic-bezier(0.5, 0, 0.5, 1.4)',
            fill: 'none',
          },
        );
      }
      break;
    case 'skybolt':
      targets.slice(0, 3).forEach((t, k) => {
        const p = centre(t);
        const bolt = s.bolt(
          jagged({ x: p.x + (jitter(seed + k) - 0.5) * 30, y: -10 }, p, seed + k, 26),
          plan.big ? 6 : 4,
        );
        s.run(
          bolt,
          [{ opacity: 1 }, { opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }, { opacity: 0 }],
          {
            duration: 420,
            delay: k * 60,
            easing: 'steps(4)',
          },
        );
        s.ring(p, 2.2 * big, k * 60);
        s.shards(p, 8, 46 * big, k * 60, seed + k, 'spark');
      });
      s.shake(hit, 0, 6);
      s.shake(plan.splash, 60, 3);
      break;
    case 'chain':
    case 'static': {
      const mouth = s.mouth;
      const stops =
        plan.recipe === 'chain' && mouth !== null
          ? [mouth, ...targets.map(centre)]
          : [...targets].sort((a, b) => a.cy - b.cy || a.cx - b.cx).map(centre);
      for (let k = 0; k + 1 < stops.length && k < 8; k++) {
        const a = stops[k] as Point;
        const b = stops[k + 1] as Point;
        const bolt = s.bolt(jagged(a, b, seed + k, 18), 3);
        s.run(bolt, [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0 }], {
          duration: 360,
          delay: k * 90,
          easing: 'steps(4)',
        });
        s.shards(b, 4, 20, k * 90, seed + k, 'spark');
      }
      s.shake(hit, 0, 4, 500);
      break;
    }
    case 'vines':
      targets.forEach((t, k) => {
        // A coil wraps the creature's middle while the vines hold it.
        const mid = { x: t.cx, y: t.y + t.h * 0.62 };
        const coil = s.spawn('fx-coil', mid);
        coil.style.setProperty('--cw', px(t.w * 1.05));
        s.run(
          coil,
          [
            {
              transform: `translate(${px(mid.x)}, ${px(mid.y + t.h * 0.4)}) scale(0.4, 0.4)`,
              opacity: 0,
            },
            {
              transform: `translate(${px(mid.x)}, ${px(mid.y)}) scale(1, 1)`,
              opacity: 1,
              offset: 0.2,
            },
            {
              transform: `translate(${px(mid.x)}, ${px(mid.y)}) scale(0.9, 1.1)`,
              opacity: 1,
              offset: 0.75,
            },
            {
              transform: `translate(${px(mid.x)}, ${px(mid.y + t.h * 0.3)}) scale(0.5, 0.5)`,
              opacity: 0,
            },
          ],
          { duration: plan.big ? 1_500 : 1_200, delay: k * 40 + 80 },
        );
        for (let v = 0; v < 4; v++) {
          const p = { x: t.x + t.w * (0.12 + v * 0.25), y: t.y + t.h + 4 };
          const el = s.spawn(`fx-vine${v === 1 || v === 2 ? ' tall' : ''}`, p);
          el.style.setProperty('--vh', px(t.h * (v === 1 || v === 2 ? 1.3 : 0.95)));
          const lean = (v - 1.5) * 16 + (jitter(seed + k * 3 + v) - 0.5) * 8;
          s.run(
            el,
            [
              {
                transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(lean)}deg) scaleY(0)`,
              },
              {
                transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(lean * 0.6)}deg) scaleY(1)`,
                offset: 0.15,
              },
              {
                transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(-lean * 0.4)}deg) scaleY(1)`,
                offset: 0.45,
              },
              {
                transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(lean * 0.5)}deg) scaleY(1)`,
                offset: 0.7,
              },
              {
                transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${String(lean)}deg) scaleY(0)`,
              },
            ],
            { duration: plan.big ? 1_500 : 1_200, delay: k * 40 + v * 30, easing: 'ease-in-out' },
          );
        }
      });
      s.shake(hit, 120, 5, plan.big ? 1_100 : 850);
      break;
    case 'pincer':
      s.rowBoxes()
        .slice(0, 1)
        .forEach((row) => {
          const first = targets[0];
          const last = targets[targets.length - 1] ?? first;
          if (first === undefined || last === undefined) return;
          for (const [edge, t, dir] of [
            [row.x - 8, first, 1],
            [row.x + row.w + 8, last, -1],
          ] as const) {
            const el = s.spawn(`fx-vine-h${dir < 0 ? ' flip' : ''}`, { x: edge, y: t.cy });
            el.style.setProperty('--len', px(Math.abs(t.cx - edge)));
            s.run(
              el,
              [
                { transform: `translate(${px(edge)}, ${px(t.cy)}) scaleX(${String(dir)})` },
                {
                  transform: `translate(${px(edge)}, ${px(t.cy)}) scaleX(${String(dir)})`,
                  offset: 0.6,
                },
                { transform: `translate(${px(edge)}, ${px(t.cy)}) scaleX(${String(dir * 0.01)})` },
              ],
              { duration: 1_000 },
            );
            s.shards(centre(t), 5, 28, 0, seed + dir, 'thorn');
          }
        });
      s.shake(hit, 0, 5, 800);
      break;
    case 'bubbles':
      targets.forEach((t, k) => {
        s.ring(centre(t), 1.4 * big, k * 30);
        s.shards(centre(t), 5, 26, k * 30, seed + k, 'bubble');
      });
      s.shake(hit, 0, 3, 400);
      break;
    case 'surge':
      s.rowBoxes().forEach((row, k) => {
        const el = surge(s, row, plan.big);
        s.run(
          el,
          [
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(0.7)`,
              opacity: 0.5,
            },
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(1.08)`,
              opacity: 0.55,
              offset: 0.18,
            },
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(0.9)`,
              opacity: 0.45,
              offset: 0.45,
            },
            {
              transform: `translate(${px(row.x - 8)}, ${px(row.y + row.h)}) scaleY(0)`,
              opacity: 0.3,
            },
          ],
          { duration: 1_100, delay: k * 80, easing: 'ease-in-out' },
        );
        for (let d = 0; d < 7; d++) {
          const p = { x: row.x + row.w * ((d + 0.5) / 7), y: row.y + row.h * 0.1 };
          s.shards(p, 1, 30, 80 + k * 80 + d * 20, seed + d + k * 11);
        }
      });
      s.shake(hit, 60, 5, 900);
      break;
    case 'swarm':
      targets.slice(0, 6).forEach((t, k) => {
        s.shards(centre(t), 6, 18, k * 30, seed + k, 'dot');
      });
      s.shake(hit, 0, 2, 700);
      break;
    case 'flames': {
      const b = s.bossBox;
      if (b === null) break;
      const p = centre(b);
      const el = s.orbit(p, Math.max(b.w, b.h) * 1.1, 18);
      s.run(
        el,
        [
          { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(0.6) rotate(0deg)`, opacity: 0 },
          {
            transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1) rotate(90deg)`,
            opacity: 1,
            offset: 0.25,
          },
          {
            transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.05) rotate(240deg)`,
            opacity: 0.8,
            offset: 0.75,
          },
          { transform: `translate(${px(p.x)}, ${px(p.y)}) scale(1.2) rotate(360deg)`, opacity: 0 },
        ],
        { duration: 1_600 },
      );
      break;
    }
    case 'shakeoff': {
      const b = s.bossBox;
      if (b === null) break;
      if (stage.boss !== null) {
        s.run(
          stage.boss,
          [
            { transform: 'rotate(0)' },
            { transform: 'rotate(-6deg)' },
            { transform: 'rotate(6deg)' },
            { transform: 'rotate(-4deg)' },
            { transform: 'rotate(4deg)' },
            { transform: 'rotate(0)' },
          ],
          {
            duration: 600,
            fill: 'none',
          },
        );
      }
      s.shards(centre(b), 12, b.w * 0.8, 120, seed, 'blob');
      break;
    }
    default:
      break;
  }
  return () => s.stop();
}
