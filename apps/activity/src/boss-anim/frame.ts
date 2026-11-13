/**
 * One frame of a boss move's animation as a pure function of the time: `frameAt(...)` says what is on the stage at `t` milliseconds
 * (the cells outlined, the markers, the weapon where it is, the bursts). The playback draws it from a clock, the workbench from a
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
  | { kind: 'cell'; key: string; box: Box; tone: 'mark' | 'hit'; opacity: number }
  /** The down-pointing marker over a cell (`x` the middle, `y` the top of the cell). */
  | { kind: 'pointer'; key: string; x: number; y: number; opacity: number }
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
      return [
        { x, y: above },
        { x, y: bottom.y + bottom.h },
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

  // The aimed cells and their markers show from the aim until the strike has passed.
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
    for (const c of plan.pointers) {
      const box = geom.cell(c);
      if (box === null) continue;
      const bob = Math.round(Math.sin(t / 90) * 2);
      items.push({
        kind: 'pointer',
        key: `pointer-${key(c)}`,
        x: box.x + box.w / 2,
        y: box.y + 2 + bob,
        opacity: phase === 'aim' ? clamp01(since * 4) : 1,
      });
    }
  }

  const weapon = look.weapon;
  const { w: weaponW, h } = sizeOf(weapon);
  const count = Math.max(1, plan.strikes.length);
  // At the hand the weapons fan out a little, so several do not sit on one another.
  const heldAt = (i: number): { x: number; y: number } => ({
    x: geom.hand.x + (i - (count - 1) / 2) * (weaponW + 4),
    y: geom.hand.y - h / 2,
  });

  if (phase === 'windup' || phase === 'aim') {
    for (let i = 0; i < count; i++) {
      const at = heldAt(i);
      const grow = phase === 'windup' ? u : 1;
      const bob = phase === 'aim' ? Math.sin(t / 110 + i) * 2 : 0;
      items.push({
        kind: 'sprite',
        key: `weapon-${String(i)}`,
        asset: weapon,
        x: at.x,
        y: at.y + bob - (1 - grow) * 6,
        rot: 0,
        scale: 0.5 + 0.5 * grow,
        opacity: grow,
      });
    }
  } else if (phase === 'throw') {
    for (let i = 0; i < count; i++) {
      const at = heldAt(i);
      items.push({
        kind: 'sprite',
        key: `weapon-${String(i)}`,
        asset: weapon,
        x: at.x,
        y: lerp(at.y, -h - 12, easeIn(u)),
        rot: 0,
        scale: 1,
        opacity: 1,
      });
    }
  } else if (phase === 'strike') {
    plan.strikes.forEach((spec, i) => {
      const path = strikePath(spec, weapon, geom);
      if (path === null) return;
      const p = along(path, spec.kind === 'hops' ? u : easeIn(u));
      items.push({
        kind: 'sprite',
        key: `weapon-${String(i)}`,
        asset: weapon,
        x: p.x,
        y: p.y,
        rot: spec.kind === 'column' || spec.kind === 'drop' || spec.kind === 'all' ? 180 : p.rot,
        scale: 1,
        opacity: 1,
      });
    });
  } else {
    // The impact: a burst on each creature hit, and its cell lit then fading.
    for (const c of plan.impacts) {
      const box = geom.cell(c);
      if (box === null) continue;
      const at = centre(box);
      items.push({ kind: 'cell', key: `hit-${key(c)}`, box, tone: 'hit', opacity: 1 - u });
      items.push({
        kind: 'sprite',
        key: `burst-${key(c)}`,
        asset: look.impact,
        x: at.x,
        y: at.y,
        rot: 0,
        scale: (plan.big ? 1.4 : 1) * (0.6 + 0.7 * Math.sqrt(u)),
        opacity: 1 - u * u,
      });
    }
  }
  return items;
}
