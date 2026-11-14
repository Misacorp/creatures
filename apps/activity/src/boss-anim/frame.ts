/**
 * One frame of a boss move's animation as a pure function of the time: `frameAt(...)` says what is on the stage at `t` milliseconds
 * (the cells lit, the weapon where it is, the bursts). The playback draws it from a clock, the workbench from a
 * slider or a step button, and a test reads it at a phase: nothing here keeps time or touches the page.
 *
 * Positions are pixels in the stage's strike layer; the geometry (where the boss's hand and each cell are) is measured by
 * `BossAnimLayer` and handed in.
 */
import { spriteSize } from '../sprites/sprite-data';
import type { Asset, ResolvedLook } from './looks';
import type { AnimPlan, Cell, StrikeSpec } from './plan';
import { phaseAt, phaseSpans } from './timeline';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  /** The size of the layer everything is drawn in. */
  layer: { w: number; h: number };
  /** Where the boss holds its weapon: the grip. */
  hand: { x: number; y: number };
  /** The box of a cell, or null when it is not on the stage. */
  cell: (cell: Cell) => Box | null;
  grid: { rows: number; cols: number };
}

export type FrameItem =
  /** A cell's outline: `mark` while it is aimed, `hit` as the impact lands. */
  | { kind: 'cell'; key: string; box: Box; tone: 'mark' | 'hit' | 'flash'; opacity: number }
  /** A sprite centred on (`x`, `y`), turned `rot` degrees clockwise from pointing up. */
  | {
      kind: 'sprite';
      key: string;
      asset: Asset;
      x: number;
      y: number;
      rot: number;
      scale: number;
      opacity: number;
      /** The soft glow round a weapon (a colour), absent for a burst or a glint. */
      glow?: string;
    };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** A fall: slow at first, quick at the end. */
const easeIn = (u: number): number => u * u;
const centre = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

const sizeOf = (asset: Asset): { w: number; h: number } => {
  const s = spriteSize(asset.sprite);
  return { w: s.width * asset.scale, h: s.height * asset.scale };
};

/** Where a weapon is on its way through the strike, as a path of straight pieces from off the stage. */
function strikePath(
  spec: StrikeSpec,
  weapon: Asset,
  geom: Geometry,
): { x: number; y: number }[] | null {
  const { w, h } = sizeOf(weapon);
  const above = -h / 2 - 8;
  const cell = (c: Cell): Box | null => geom.cell(c);
  switch (spec.kind) {
    case 'column': {
      const top = cell({ row: 0, col: spec.col });
      const bottom = cell({ row: geom.grid.rows - 1, col: spec.col });
      if (top === null || bottom === null) return null;
      const x = centre(top).x;
      // Through the whole column and out past its last row: the lance passes, it does not stop in the board.
      return [
        { x, y: above },
        { x, y: bottom.y + bottom.h + h / 2 + 8 },
      ];
    }
    case 'row': {
      const first = cell({ row: spec.row, col: 0 });
      if (first === null) return null;
      const y = centre(first).y;
      const far = geom.layer.w + w / 2 + 8;
      return spec.from === 'left'
        ? [
            { x: -w / 2 - 8, y },
            { x: far, y },
          ]
        : [
            { x: far, y },
            { x: -w / 2 - 8, y },
          ];
    }
    case 'span': {
      const a = cell({ row: spec.row, col: spec.fromCol });
      const b = cell({ row: spec.row, col: spec.toCol });
      if (a === null || b === null) return null;
      const y = centre(a).y;
      return [
        { x: a.x - w / 2, y },
        { x: b.x + b.w + w / 2, y },
      ];
    }
    case 'end': {
      const target = cell({ row: spec.row, col: spec.col });
      if (target === null) return null;
      const c = centre(target);
      return [{ x: spec.from === 'left' ? -w / 2 - 8 : geom.layer.w + w / 2 + 8, y: c.y }, c];
    }
    case 'drop': {
      const target = cell(spec.cell);
      if (target === null) return null;
      const c = centre(target);
      return [{ x: c.x, y: above }, c];
    }
    case 'hops': {
      const points = spec.cells.flatMap((c) => {
        const b = cell(c);
        return b === null ? [] : [centre(b)];
      });
      const first = points[0];
      return first === undefined ? null : [{ x: first.x, y: above }, ...points];
    }
    case 'all': {
      const cells = Array.from({ length: geom.grid.rows * geom.grid.cols }, (_, k) =>
        cell({ row: k % geom.grid.rows, col: Math.floor(k / geom.grid.rows) }),
      ).filter((b): b is Box => b !== null);
      if (cells.length === 0) return null;
      const left = Math.min(...cells.map((b) => b.x));
      const right = Math.max(...cells.map((b) => b.x + b.w));
      const bottom = Math.max(...cells.map((b) => b.y + b.h));
      const top = Math.min(...cells.map((b) => b.y));
      const x = (left + right) / 2;
      return [
        { x, y: above },
        { x, y: (top + bottom) / 2 },
      ];
    }
  }
}

/** The point `u` of the way along a path of pieces (equal time per piece) and the way it is heading, in degrees from pointing up. */
function along(
  path: readonly { x: number; y: number }[],
  u: number,
): { x: number; y: number; rot: number } {
  const pieces = path.length - 1;
  const at = clamp01(u) * pieces;
  const k = Math.min(pieces - 1, Math.floor(at));
  const a = path[k] as { x: number; y: number };
  const b = path[k + 1] as { x: number; y: number };
  const local = at - k;
  const rot = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local), rot };
}

/** How long (of the impact phase) the white flash on the hit cells lasts. */
const FLASH_U = 0.2;
/** The weapon is held tilted and smaller in the hand, so a long lance stays on the stage; it straightens as it is thrown. */
const HELD_TILT = 38;
const HELD_SCALE = 0.7;
/** At most this many copies are held in the hand (a move with many strikes still flies every one of them), kept within the boss's art. */
export const HELD_MAX = 2;
/** The widest gap between two held copies, in pixels. */
const HELD_GAP_MAX = 34;

/** What is on the stage `t` milliseconds into a move that takes `totalMs`. Nothing before the wind-up and nothing after the impact. */
export function frameAt(
  plan: AnimPlan,
  look: ResolvedLook,
  geom: Geometry,
  totalMs: number,
  t: number,
): FrameItem[] {
  if (t < 0 || t > totalMs) return [];
  const items: FrameItem[] = [];
  const { id: phase, u } = phaseAt(totalMs, t);
  const spans = phaseSpans(totalMs);
  const aimStart = spans.find((s) => s.id === 'aim')?.start ?? 0;
  const key = (k: Cell): string => `${String(k.row)}-${String(k.col)}`;

  // The aimed cells light up (the board's own target highlight) from the aim until the strike has passed.
  if (phase === 'aim' || phase === 'throw' || phase === 'strike') {
    const since = clamp01(
      (t - aimStart) / Math.max(1, (spans.find((s) => s.id === 'aim')?.end ?? 1) - aimStart),
    );
    // A short blink as the cells light up, then steady.
    const opacity = phase === 'aim' ? 0.45 + 0.4 * clamp01(since * 3) : 0.85;
    for (const c of plan.marks) {
      const box = geom.cell(c);
      if (box !== null)
        items.push({ kind: 'cell', key: `mark-${key(c)}`, box, tone: 'mark', opacity });
    }
  }

  const weapon = look.weapon;
  const { w: weaponW, h } = sizeOf(weapon);
  const count = Math.max(1, plan.strikes.length);
  const held = Math.min(count, HELD_MAX);
  // Two copies side by side are drawn a little smaller so they stay within the boss's art.
  const heldScale = held > 1 ? HELD_SCALE * 0.85 : HELD_SCALE;
  const glow = look.glow;
  // The grip is at the hand; the weapon leans away from it, so its middle is up and to the right of the grip.
  const heldAt = (i: number, tilt: number, scale: number): { x: number; y: number } => {
    const rad = (tilt * Math.PI) / 180;
    return {
      x:
        geom.hand.x +
        ((i % held) - (held - 1) / 2) * Math.min(weaponW * scale + 6, HELD_GAP_MAX) +
        (Math.sin(rad) * h * scale) / 2,
      y: geom.hand.y - (Math.cos(rad) * h * scale) / 2,
    };
  };
  const weaponItem = (
    i: number,
    at: { x: number; y: number },
    rot: number,
    scale: number,
    opacity: number,
  ): FrameItem => ({
    kind: 'sprite',
    key: `weapon-${String(i)}`,
    asset: weapon,
    x: at.x,
    y: at.y,
    rot,
    scale,
    opacity,
    glow,
  });

  if (phase === 'windup') {
    // It appears in the hand: a quick scale-in from the grip with a glint.
    const grow = clamp01(u * 1.6);
    const s = heldScale * (0.15 + 0.85 * grow);
    for (let i = 0; i < held; i++)
      items.push(weaponItem(i, heldAt(i, HELD_TILT, s), HELD_TILT, s, clamp01(u * 3)));
    const glint = clamp01(1 - Math.abs(u - 0.35) * 3.5);
    if (glint > 0)
      items.push({
        kind: 'sprite',
        key: 'glint',
        asset: look.glint,
        x: geom.hand.x,
        y: geom.hand.y - 6,
        rot: 0,
        scale: 0.6 + glint,
        opacity: glint,
      });
  } else if (phase === 'aim') {
    for (let i = 0; i < held; i++) {
      const at = heldAt(i, HELD_TILT, heldScale);
      const bob = Math.sin(t / 110 + i) * 2;
      items.push(weaponItem(i, { x: at.x, y: at.y + bob }, HELD_TILT, heldScale, 1));
    }
  } else if (phase === 'throw') {
    // It straightens and leaves the stage upwards.
    for (let i = 0; i < count; i++) {
      const tilt = lerp(HELD_TILT, 0, clamp01(u * 2));
      const s = lerp(heldScale, 1, clamp01(u * 2));
      const from = heldAt(i, tilt, s);
      items.push(weaponItem(i, { x: from.x, y: lerp(from.y, -h - 12, easeIn(u)) }, tilt, s, 1));
    }
  } else if (phase === 'strike') {
    plan.strikes.forEach((spec, i) => {
      const path = strikePath(spec, weapon, geom);
      if (path === null) return;
      const at = (v: number): { x: number; y: number; rot: number } =>
        along(path, spec.kind === 'hops' ? v : easeIn(v));
      const fixedRot = spec.kind === 'column' || spec.kind === 'drop' || spec.kind === 'all';
      // A trail: a few fading after-images behind the weapon.
      for (let k = 3; k >= 1; k--) {
        const back = u - k * 0.07;
        if (back <= 0) continue;
        const g = at(back);
        items.push({
          ...weaponItem(i, g, fixedRot ? 180 : g.rot, 1, 0.5 - k * 0.12),
          key: `trail-${String(i)}-${String(k)}`,
        });
      }
      const p = at(u);
      items.push(weaponItem(i, p, fixedRot ? 180 : p.rot, 1, 1));
    });
  } else {
    // The impact: a white flash on the cells hit and a few sparks at the corners of each card; the creature stays readable.
    for (const c of plan.impacts) {
      const box = geom.cell(c);
      if (box === null) continue;
      if (u < FLASH_U)
        items.push({
          kind: 'cell',
          key: `flash-${key(c)}`,
          box,
          tone: 'flash',
          opacity: 1 - u / FLASH_U,
        });
      items.push({ kind: 'cell', key: `hit-${key(c)}`, box, tone: 'hit', opacity: (1 - u) * 0.6 });
      const reach = 4 + 10 * Math.sqrt(u);
      const corners: [number, number][] = [
        [box.x - reach, box.y - reach],
        [box.x + box.w + reach, box.y - reach],
        [box.x - reach, box.y + box.h + reach],
        [box.x + box.w + reach, box.y + box.h + reach],
      ];
      corners.forEach(([x, y], k) =>
        items.push({
          kind: 'sprite',
          key: `spark-${key(c)}-${String(k)}`,
          asset: look.impact,
          x,
          y,
          rot: 0,
          scale: (plan.big ? 1.2 : 1) * (1 - 0.4 * u),
          opacity: 1 - u * u,
        }),
      );
    }
  }
  return items;
}

/** How far the board is shaken `t` milliseconds in: a heavy move (a one-shot, the whole board) rattles it as it lands, then it settles. */
export function shakeAt(
  plan: AnimPlan,
  look: ResolvedLook,
  totalMs: number,
  t: number,
): { x: number; y: number } {
  if (!look.heavy && !plan.big) return { x: 0, y: 0 };
  const { id, u } = phaseAt(totalMs, t);
  if (id !== 'impact' || t > totalMs) return { x: 0, y: 0 };
  const fade = 1 - u;
  return { x: Math.round(Math.sin(t / 18) * 4 * fade), y: Math.round(Math.cos(t / 23) * 2 * fade) };
}
