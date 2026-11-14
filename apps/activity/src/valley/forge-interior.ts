/**
 * The Forge seen from inside (`ForgeInside` in `ForgeScenes.tsx`; Misa, 2026-11-11): a workshop room laid out on a 128 x 96 logical
 * canvas (`ROOM`; the Art session's preview of the set `valley-forge-interior` has the same layout) with a front strip under it for
 * the player's things (`ROOM_H` in all), scaled to the window like the other scenes (a whole pixel scale, at most 4) and centred
 * sideways; the wall and the floor go on to every edge, so a wider window shows more room, never a different one. Pure: the scene's
 * size goes in, boxes and placements come out. The pieces are `forge-interior-art.ts` (by name).
 *
 * The room, in room pixels from its top-left (the anchor of each piece is its top-left):
 * - back wall 128x56, tiled sideways, moved 40 to the right (the art's own placement: the furnace hides one window, the other
 *   stays in view); floor tiles from y 56 down, to every edge; furnace-glow 128x40 at (0, 56) over the floor tiles, under the props.
 * - furnace 48x52 at (2, 11): base at y 62, the mouth's centre at x 25. A click opens the project board.
 * - on the wall: hanging-tools 24x16 at (52, 6), tool-rack 32x24 at (92, 6), shelf 32x16 at (92, 30).
 * - two workbenches 32x20 at (60, 52) and (96, 52): other players' smiths stand behind them, two to a bench, smaller than the
 *   player's, at x 69, 83 (bench one) and 105, 119 (bench two), their feet two rows under the bench top (y 58).
 * - on the floor: barrel 12x16 at (116, 60), coal-heap 16x10 at (6, 66), quench-trough 24x12 at (100, 78).
 * - the player's anvils: a row of cells (26 wide at most) from y 66 over x 22 to 126, then the dashed outline of the next; each cell
 *   has the smith (16x16) at its top, the anvil (16x16) 12 below it and the smith's plate under that.
 * - the front strip, y 104 down: the doormat (24x8) at x 6, the way out, and the plans table, the chest (the bag) and the crate (the
 *   floor), 16x16 each, at x 44, 68 and 92.
 * In a scene taller than `ROOM_H` the cells and the front strip stand lower, up to `MAX_DROP`, half the spare height; the wall stays.
 */
import type { Placement } from '../games/art/pixel';
import { sceneScale } from './scale';
import { ANVIL_PROP, CHEST_PROP, CRATE_PROP, PLANS_PROP } from './forge-props';
import { CELL_H, PROP, type Cell, type Pt } from './forge-canvas';
import { PIECE_SIZE, interiorSprite, type InteriorPiece } from './forge-interior-art';
import type { SceneGeometry } from './SceneFrame';

/** The art's room in scene pixels, and the whole interior's height with the front strip. */
export const ROOM = { w: 128, h: 96 } as const;
export const ROOM_H = 124;

/** The most background smiths (two to a bench, two benches). */
export const BACK_SPOTS = 4;

/** Where each piece of the room stands, in room pixels. */
export const ROOM_AT = {
  furnace: { x: 2, y: 11 },
  'hanging-tools': { x: 52, y: 6 },
  'tool-rack': { x: 92, y: 6 },
  shelf: { x: 92, y: 30 },
  workbench: { x: 60, y: 52 },
  barrel: { x: 116, y: 60 },
  'coal-heap': { x: 6, y: 66 },
  'quench-trough': { x: 100, y: 78 },
  'furnace-glow': { x: 0, y: 56 },
  doormat: { x: 6, y: 106 },
} as const satisfies Partial<Record<InteriorPiece, Pt>>;
/** The second bench, and how far the wall is moved to the right. */
const BENCH_B: Pt = { x: 96, y: 52 };
const WALL_SHIFT = 40;
/** Where the smiths' feet stand behind the benches, and the centres of the four spots, in room pixels. */
const BACK_FEET_Y = 58;
const BACK_CENTRES = [69, 83, 105, 119] as const;
/** The anvils' row: its top, and the span of x it uses. */
const ROW_Y = 66;
const ROW_FROM = 22;
const ROW_TO = 126;
const CELL_MAX = 26;
/** The front strip: the props' top, and their x. */
const STRIP_Y = 104;
const PROPS_X = [44, 68, 92] as const;
/** The most the floor part may be pushed down in a scene taller than the room. */
const MAX_DROP = 24;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InteriorLayout {
  /** The room's top-left in scene pixels. */
  ox: number;
  oy: number;
  furnace: Box;
  /** The doormat, the way out. */
  door: Box;
  /** The two benches' top-lefts. */
  benches: [Pt, Pt];
  /** Where a background smith stands: the centre x and the feet's y, scene pixels. */
  backSpots: { x: number; y: number }[];
  cells: Cell[];
  plans: Pt;
  chest: Pt;
  crate: Pt;
}

/**
 * The interior's pixel scale: as everywhere (3 on a phone, 4 on a wide window), but never wider than the room fits (`ROOM.w` times the
 * scale at most the width) nor taller than the window (`ROOM_H` times the scale at most the height), never under 1.
 */
export function interiorScale(width: number, height: number): number {
  let s = Math.min(sceneScale(width), Math.floor(width / ROOM.w));
  while (s > 1 && ROOM_H * s > height) s -= 1;
  return Math.max(1, s);
}

/** The layout for `slots` cells (the anvils owned, plus one for the next to buy) in a scene of `g`'s size. */
export function interiorLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx'>,
  slots: number,
): InteriorLayout {
  const ox = g.cx - ROOM.w / 2;
  const oy = 0;
  const drop = Math.max(0, Math.min(MAX_DROP, Math.floor((g.H - ROOM_H) / 2)));
  const at = (p: Pt): Pt => ({ x: ox + p.x, y: oy + p.y });
  const avail = ROW_TO - ROW_FROM;
  const step = Math.min(CELL_MAX, Math.max(PROP, Math.floor(avail / Math.max(1, slots))));
  const x0 = ox + ROW_FROM + Math.floor((avail - step * slots) / 2);
  const cells: Cell[] = Array.from({ length: slots }, (_, i) => {
    const x = x0 + i * step;
    const ax = x + Math.floor((step - PROP) / 2);
    const y = oy + ROW_Y + drop;
    return { x, y, w: step, h: CELL_H, anvil: { x: ax, y: y + 12 }, smith: { x: ax, y } };
  });
  const furnace = at(ROOM_AT.furnace);
  const mat = at({ x: ROOM_AT.doormat.x, y: ROOM_AT.doormat.y + drop });
  const prop = (i: number): Pt => at({ x: PROPS_X[i] ?? 0, y: STRIP_Y + drop });
  return {
    ox,
    oy,
    furnace: { ...furnace, w: PIECE_SIZE.furnace.w, h: PIECE_SIZE.furnace.h },
    door: { ...mat, w: PIECE_SIZE.doormat.w, h: PIECE_SIZE.doormat.h },
    benches: [at(ROOM_AT.workbench), at(BENCH_B)],
    backSpots: BACK_CENTRES.map((x) => ({ x: ox + x, y: oy + BACK_FEET_Y })),
    cells,
    plans: prop(0),
    chest: prop(1),
    crate: prop(2),
  };
}

/** The tiles of one piece along a row, from the first one at or before the left edge to the right edge. */
function across(
  sprite: ReturnType<typeof interiorSprite>,
  w: number,
  left: number,
  edge: number,
  y: number,
): Placement[] {
  const out: Placement[] = [];
  let x = left - Math.ceil(Math.max(0, left) / w) * w;
  while (x < edge) {
    out.push({ sprite, x, y });
    x += w;
  }
  return out;
}

/**
 * The room as sprites on the canvas: the wall and the floor to every edge, the firelight on the floor, the furnace, what hangs on the
 * wall, the props on the floor, the doormat, and an anvil for each cell owned and the three props. The benches are not here: they
 * stand in front of the smiths behind them, so they are drawn over those (`ForgeInside`). `night` picks the palette.
 */
export function interiorSceneDraw(owned: number, slots: number, night: boolean) {
  return (g: SceneGeometry): Placement[] => {
    const lay = interiorLayout(g, slots);
    const sprite = (piece: InteriorPiece): ReturnType<typeof interiorSprite> =>
      interiorSprite(piece, night);
    const out: Placement[] = [];
    out.push(
      ...across(sprite('back-wall'), PIECE_SIZE['back-wall'].w, lay.ox + WALL_SHIFT, g.W, lay.oy),
    );
    const tile = PIECE_SIZE.floor;
    for (let y = lay.oy + PIECE_SIZE['back-wall'].h; y < g.H; y += tile.h) {
      out.push(...across(sprite('floor'), tile.w, lay.ox, g.W, y));
    }
    const at = (piece: keyof typeof ROOM_AT): Placement => {
      const p = ROOM_AT[piece];
      return { sprite: sprite(piece), x: lay.ox + p.x, y: lay.oy + p.y };
    };
    out.push(at('furnace-glow'));
    out.push(at('hanging-tools'), at('tool-rack'), at('shelf'), at('furnace'));
    out.push(at('barrel'), at('coal-heap'), at('quench-trough'));
    out.push({ sprite: sprite('doormat'), x: lay.door.x, y: lay.door.y });
    out.push(
      ...lay.cells.slice(0, owned).map((c) => ({ sprite: ANVIL_PROP, x: c.anvil.x, y: c.anvil.y })),
      { sprite: PLANS_PROP, x: lay.plans.x, y: lay.plans.y },
      { sprite: CHEST_PROP, x: lay.chest.x, y: lay.chest.y },
      { sprite: CRATE_PROP, x: lay.crate.x, y: lay.crate.y },
    );
    return out;
  };
}
