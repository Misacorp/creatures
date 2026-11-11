/**
 * The Forge seen from inside (`ForgeInterior` in `ForgeCanvas.tsx`; Misa, 2026-11-11): a workshop room laid out on a 128 x 96 logical
 * canvas (`ROOM`), scaled to the window like the other scenes (a whole pixel scale, at most 4) and centred sideways; the wall and the
 * floor go on to every edge of the scene, so a wider window shows more room, never a different one. Pure: the scene's size goes in,
 * boxes and placements come out. The pieces are `forge-interior-art.ts` (by name; the Art session's set swaps in there).
 *
 * The room, in room pixels from its top-left (the anchor of each piece is its top-left unless said):
 * - back wall 128x56 at (0, 0), tiled sideways; floor tiles from y 56 down, to every edge.
 * - furnace 48x56 at (2, 4), the fire in its mouth (flame flicker over (22, 36)); a click opens the project board.
 * - on the wall: hanging-tools 24x16 at (74, 0), shelf 32x16 at (50, 20), tool-rack 32x24 at (82, 16).
 * - two workbenches 32x20 at (50, 36) and (82, 36), feet on the wall's foot (y 56): other players' smiths stand behind them, two to a
 *   bench, at x 58, 74 (bench one) and 90, 106 (bench two), their feet at y 42.
 * - the door 14x24 at (114, 24): the way back outside.
 * - on the floor, behind the anvils: coal-heap 16x10 at (30, 50), quench-trough 24x12 at (52, 57), barrel 12x16 at (98, 50).
 * - (in a scene taller than 96 the anvils and props below stand up to 40 lower, half the spare height; the wall stays)
 * - the player's anvils: a row of cells (28 wide at most, 34 tall) from y 60 over x 4 to 106, then the dashed outline of the next; each
 *   cell has the smith (16x16) at its top, the anvil (16x16) 12 below it and the smith's plate under that.
 * - three props down the right edge, 16x16 each at x 110: the plans table (y 48), the chest, the bag (y 64), the crate, the floor (y 80).
 */
import type { Placement } from '../games/art/pixel';
import { sceneScale } from './scale';
import { ANVIL_PROP, CHEST_PROP, CRATE_PROP, PLANS_PROP } from './forge-props';
import { CELL_H, CELL_W, PROP, type Cell, type Pt } from './forge-canvas';
import { PIECE_SIZE, interiorSprite, type InteriorPiece } from './forge-interior-art';
import type { SceneGeometry } from './SceneFrame';

/** The room's size in scene pixels. */
export const ROOM = { w: 128, h: 96 } as const;

/** The most background smiths (two to a bench, two benches). */
export const BACK_SPOTS = 4;

/** Where each piece of the room stands, in room pixels. */
export const ROOM_AT: Readonly<Record<Exclude<InteriorPiece, 'back-wall' | 'floor'>, Pt>> = {
  furnace: { x: 2, y: 4 },
  'hanging-tools': { x: 74, y: 0 },
  shelf: { x: 50, y: 20 },
  'tool-rack': { x: 82, y: 16 },
  workbench: { x: 50, y: 36 },
  barrel: { x: 98, y: 50 },
  'quench-trough': { x: 52, y: 57 },
  'coal-heap': { x: 30, y: 50 },
  door: { x: 114, y: 24 },
};
/** The second bench, at the first's right. */
const BENCH_B: Pt = { x: 82, y: 36 };
/** The flame's top-left over the furnace's mouth, and where the smiths' feet stand behind the benches. */
const FLAME_AT: Pt = { x: 24, y: 38 };
const BACK_FEET_Y = 42;
const BACK_CENTRES = [58, 74, 90, 106] as const;
/** The anvils' row: its top, and the span of x it uses. */
const ROW_Y = 60;
const ROW_FROM = 4;
const ROW_TO = 106;
const PROPS_X = 110;
/** The most the floor part may be pushed down in a scene taller than the room. */
const MAX_DROP = 40;

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
  door: Box;
  /** Where the flame flickers (top-left). */
  flame: Pt;
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
 * scale at most the width) nor taller than the window (`ROOM.h` times the scale at most the height), never under 1.
 */
export function interiorScale(width: number, height: number): number {
  let s = Math.min(sceneScale(width), Math.floor(width / ROOM.w));
  while (s > 1 && ROOM.h * s > height) s -= 1;
  return Math.max(1, s);
}

/** The layout for `slots` cells (the anvils owned, plus one for the next to buy) in a scene of `g`'s size. */
export function interiorLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx'>,
  slots: number,
): InteriorLayout {
  const ox = g.cx - ROOM.w / 2;
  const oy = 0;
  // A scene taller than the room lets the floor grow: the anvils and the props stand lower, the wall stays at the top.
  const drop = Math.max(0, Math.min(MAX_DROP, Math.floor((g.H - ROOM.h) / 2)));
  const at = (p: Pt): Pt => ({ x: ox + p.x, y: oy + p.y });
  const avail = ROW_TO - ROW_FROM;
  const step = Math.min(CELL_W, Math.max(PROP, Math.floor(avail / Math.max(1, slots))));
  const x0 = ox + ROW_FROM + Math.floor((avail - step * slots) / 2);
  const cells: Cell[] = Array.from({ length: slots }, (_, i) => {
    const x = x0 + i * step;
    const ax = x + Math.floor((step - PROP) / 2);
    const y = oy + ROW_Y + drop;
    return { x, y, w: step, h: CELL_H, anvil: { x: ax, y: y + 12 }, smith: { x: ax, y } };
  });
  const furnace = at(ROOM_AT.furnace);
  const door = at(ROOM_AT.door);
  return {
    ox,
    oy,
    furnace: { ...furnace, w: PIECE_SIZE.furnace.w, h: PIECE_SIZE.furnace.h },
    door: { ...door, w: PIECE_SIZE.door.w, h: PIECE_SIZE.door.h },
    flame: at(FLAME_AT),
    benches: [at(ROOM_AT.workbench), at(BENCH_B)],
    backSpots: BACK_CENTRES.map((x) => ({ x: ox + x, y: oy + BACK_FEET_Y })),
    cells,
    plans: at({ x: PROPS_X, y: 48 + drop }),
    chest: at({ x: PROPS_X, y: 64 + drop }),
    crate: at({ x: PROPS_X, y: 80 + drop }),
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
 * The room as sprites on the canvas: the wall and the floor to every edge, the furnace, what hangs and stands on the wall, the
 * decorations on the floor, the door, and an anvil for each cell owned and the three props. The benches are not here: they stand in
 * front of the smiths behind them, so they are drawn over those (`ForgeInterior`). `night` picks the palette.
 */
export function interiorSceneDraw(owned: number, slots: number, night: boolean) {
  return (g: SceneGeometry): Placement[] => {
    const lay = interiorLayout(g, slots);
    const sprite = (piece: InteriorPiece): ReturnType<typeof interiorSprite> =>
      interiorSprite(piece, night);
    const out: Placement[] = [];
    out.push(...across(sprite('back-wall'), PIECE_SIZE['back-wall'].w, lay.ox, g.W, 0));
    const tile = PIECE_SIZE.floor;
    for (let y = PIECE_SIZE['back-wall'].h; y < g.H; y += tile.h) {
      out.push(...across(sprite('floor'), tile.w, lay.ox, g.W, y));
    }
    const put = (piece: Exclude<InteriorPiece, 'back-wall' | 'floor' | 'workbench'>): void => {
      const p = ROOM_AT[piece];
      out.push({ sprite: sprite(piece), x: lay.ox + p.x, y: lay.oy + p.y });
    };
    put('hanging-tools');
    put('shelf');
    put('tool-rack');
    put('door');
    put('furnace');
    put('quench-trough');
    put('coal-heap');
    put('barrel');
    out.push(
      ...lay.cells.slice(0, owned).map((c) => ({ sprite: ANVIL_PROP, x: c.anvil.x, y: c.anvil.y })),
      { sprite: PLANS_PROP, x: lay.plans.x, y: lay.plans.y },
      { sprite: CHEST_PROP, x: lay.chest.x, y: lay.chest.y },
      { sprite: CRATE_PROP, x: lay.crate.x, y: lay.crate.y },
    );
    return out;
  };
}
