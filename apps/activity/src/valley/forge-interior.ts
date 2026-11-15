/**
 * The Forge seen from inside (`ForgeInside` in `ForgeScenes.tsx`; Misa, 2026-11-11): a workshop room laid out on a 128 x 176 logical
 * canvas (`ROOM`; the Art session's preview of the set `valley-forge-interior` has the same layout, with the anvils moved to make room
 * for up to four). The scene fills the window (Misa, 2026-11-15: "it should fill the screen, even if the clickable elements are still in
 * the middle"): the room is centred sideways at a whole pixel scale, the back wall and the floor are tiled to every edge, the floor goes
 * on below the front zone, and the new edges are dressed with quiet pieces (windows, a lantern, a tool rack, barrels, sacks, a woodpile).
 * Pure: the scene's size goes in, boxes and placements come out. The pieces are `forge-interior-art.ts` (by name).
 *
 * The room, in room pixels from its top-left (the anchor of each piece is its top-left; [C] is clickable):
 * - back wall 128x56 tiled sideways, moved 40 to the right (the furnace hides one window); floor tiles from y 56 down, to every edge,
 *   the rug first on them, furnace-glow 128x40 at (0, 56) over them, under the props.
 * - on the wall: window-2 (46, 9), shelf (56, 24), lantern-hanging (79, 6), hanging-tools (98, 6), [C] door (98, 26) with its mat (98, 58).
 * - furnace 48x52 at (2, 11) [C]: a click opens the project board.
 * - two benches 32x20 at (60, 52) and (96, 82): other players' smiths stand behind them, two to a bench, small, at x 69, 83 and 105, 119.
 * - the player's anvils [C], two to a row: centres x 32 and 74, rows y 72 and 134; each cell has the smith (16x16) at its top, the anvil
 *   (16x16) 12 below it and the name plate 28 down. The dashed outline of the next anvil takes the next cell.
 * - [C] chest (the bag) (6, 110), plans-board (the plans) (36, 106), finished-crate (the floor) (74, 112); trough (98, 110).
 * - dressing: coal-heap (6, 66), cat (44, 66), woodpile (2, 138), sacks (4, 160), bucket (52, 164), barrel-stack (100, 124), gear-rack
 *   (102, 150).
 * The working height (`ESSENTIAL_H`) is what must be in view whatever the window; the rest of the front zone is dressing and may be cut.
 */
import type { Placement } from '../games/art/pixel';
import { sceneScale } from './scale';
import { CHEST_PROP, ANVIL_PROP } from './forge-props';
import { CELL_H, type Cell, type Pt } from './forge-canvas';
import { PIECE_SIZE, interiorSprite, type InteriorPiece } from './forge-interior-art';
import { forgeFill, type FillVariant } from './art-variants';
import type { SceneGeometry } from './SceneFrame';

/** The art's room in scene pixels (its phone layout), and the working height that always stays in view. */
export const ROOM = { w: 128, h: 176 } as const;
export const ROOM_H = ROOM.h;
export const ESSENTIAL_H = 170;
/** Variant B: the wall's top rows cropped off, so the working height that must show is this much shorter. */
export const CROP_B = 7;

/** The most background smiths (two to a bench, two benches). */
export const BACK_SPOTS = 4;

/** Where each piece of the room stands, in room pixels. */
export const ROOM_AT = {
  furnace: { x: 2, y: 11 },
  'window-2': { x: 46, y: 9 },
  shelf: { x: 56, y: 24 },
  'lantern-hanging': { x: 79, y: 6 },
  'hanging-tools': { x: 98, y: 6 },
  door: { x: 98, y: 26 },
  'door-mat': { x: 98, y: 58 },
  workbench: { x: 60, y: 52 },
  'coal-heap': { x: 6, y: 66 },
  cat: { x: 44, y: 66 },
  chest: { x: 6, y: 110 },
  'plans-board': { x: 36, y: 106 },
  'finished-crate': { x: 74, y: 112 },
  'quench-trough': { x: 98, y: 110 },
  woodpile: { x: 2, y: 138 },
  rug: { x: 40, y: 146 },
  'barrel-stack': { x: 100, y: 124 },
  'gear-rack': { x: 102, y: 150 },
  sacks: { x: 4, y: 160 },
  bucket: { x: 52, y: 164 },
  'furnace-glow': { x: 0, y: 56 },
} as const satisfies Partial<Record<InteriorPiece | 'chest', Pt>>;
/** The second bench, and how far the wall is moved to the right. */
const BENCH_B: Pt = { x: 96, y: 82 };
const WALL_SHIFT = 40;
/** Where the smiths' feet stand behind each bench, and the centres of the four spots, in room pixels. */
const BACK_FEET = [58, 58, 88, 88] as const;
const BACK_CENTRES = [69, 83, 105, 119] as const;
/** The anvils' cells: the centre x of each of the two columns, the top y of each of the two rows, and a cell's width. */
const COL_X = [32, 74] as const;
const ROW_Y = [72, 134] as const;
const CELL_W = 34;

/**
 * What stands at the new edges of a wide window, in room pixels (x may be negative: left of the room, or past 128: right of it). The
 * clickable cluster stays centred; these are quiet pieces with no plate and no tap.
 */
const EDGE_DRESSING: readonly { piece: InteriorPiece; x: number; y: number }[] = [
  // left of the room
  { piece: 'barrel', x: -16, y: 60 },
  { piece: 'sacks', x: -26, y: 94 },
  { piece: 'barrel-stack', x: -32, y: 124 },
  { piece: 'woodpile', x: -34, y: 150 },
  { piece: 'barrel', x: -62, y: 62 },
  { piece: 'sacks', x: -76, y: 150 },
  // right of the room
  { piece: 'barrel', x: 132, y: 60 },
  { piece: 'woodpile', x: 134, y: 96 },
  { piece: 'barrel-stack', x: 136, y: 130 },
  { piece: 'sacks', x: 142, y: 162 },
  { piece: 'barrel', x: 164, y: 62 },
  { piece: 'barrel-stack', x: 176, y: 140 },
];

/**
 * The side walls: the wall tile has its windows 64 apart, so between two of them there is a gap 42 wide with its middle at 32 + 64 k
 * (room pixels). Going outward from the room each gap holds one thing, in turn: a tool rack, a pair of narrow windows (four apart), a
 * lantern. The right side starts one along, so the two sides do not mirror.
 */
function wallDressing(from: number, to: number): { piece: InteriorPiece; x: number; y: number }[] {
  const kinds = ['tool-rack', 'window-2', 'lantern-hanging'] as const;
  const out: { piece: InteriorPiece; x: number; y: number }[] = [];
  const put = (kind: (typeof kinds)[number], centre: number): void => {
    if (kind === 'tool-rack') out.push({ piece: kind, x: centre - 16, y: 8 });
    else if (kind === 'lantern-hanging') out.push({ piece: kind, x: centre - 12, y: 6 });
    else out.push({ piece: kind, x: centre - 14, y: 9 }, { piece: kind, x: centre + 2, y: 9 });
  };
  for (let k = 0; -32 - 64 * k + 21 > from; k += 1) put(kinds[k % 3] ?? 'tool-rack', -32 - 64 * k);
  for (let k = 0; 160 + 64 * k - 21 < to; k += 1)
    put(kinds[(k + 1) % 3] ?? 'tool-rack', 160 + 64 * k);
  return out;
}

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
  /** The door with its mat, the way out. */
  door: Box;
  /** The two benches' top-lefts. */
  benches: [Pt, Pt];
  /** Where a background smith stands: the centre x and the feet's y, scene pixels. */
  backSpots: { x: number; y: number }[];
  cells: Cell[];
  plans: Box;
  chest: Box;
  crate: Box;
}

/** How much of the room's top is cropped in a fill variant. */
function cropOf(fill: FillVariant): number {
  return fill === 'B' ? CROP_B : 0;
}

/**
 * The interior's pixel scale: as everywhere (3 on a phone, 4 on a wide window; variant B one more), but never wider than the room fits
 * (`ROOM.w` times the scale at most the width) nor taller than the window shows the working height (`ESSENTIAL_H`, less the crop of B,
 * times the scale at most the height), never under 1. The size depends on the window alone, never on how many anvils there are, so the
 * scene does not change size while you are in it.
 */
export function interiorScale(
  width: number,
  height: number,
  fill: FillVariant = forgeFill(),
): number {
  const cap = sceneScale(width) + (fill === 'B' ? 1 : 0);
  let s = Math.min(cap, Math.floor(width / ROOM.w));
  const need = ESSENTIAL_H - cropOf(fill);
  while (s > 1 && need * s > height) s -= 1;
  return Math.max(1, s);
}

/** The layout for `slots` cells (the anvils owned, plus one for the next to buy) in a scene of `g`'s size. */
export function interiorLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx'>,
  slots: number,
  fill: FillVariant = forgeFill(),
): InteriorLayout {
  const ox = g.cx - ROOM.w / 2;
  const oy = fill === 'B' ? -CROP_B : 0;
  const at = (p: Pt): Pt => ({ x: ox + p.x, y: oy + p.y });
  const box = (piece: InteriorPiece, p: Pt): Box => ({ ...at(p), ...PIECE_SIZE[piece] });
  const cells: Cell[] = Array.from({ length: Math.min(slots, 4) }, (_, i) => {
    const cx = ox + (COL_X[i % 2] ?? 32);
    const y = oy + (ROW_Y[Math.floor(i / 2)] ?? 72);
    const ax = cx - 8;
    return {
      x: cx - CELL_W / 2,
      y,
      w: CELL_W,
      h: CELL_H,
      anvil: { x: ax, y: y + 12 },
      smith: { x: ax, y },
    };
  });
  const door = at(ROOM_AT.door);
  return {
    ox,
    oy,
    furnace: box('furnace', ROOM_AT.furnace),
    door: { ...door, w: PIECE_SIZE.door.w, h: PIECE_SIZE.door.h + PIECE_SIZE['door-mat'].h },
    benches: [at(ROOM_AT.workbench), at(BENCH_B)],
    backSpots: BACK_CENTRES.map((x, i) => ({ x: ox + x, y: oy + (BACK_FEET[i] ?? 58) })),
    cells,
    plans: box('plans-board', ROOM_AT['plans-board']),
    chest: { ...at(ROOM_AT.chest), w: 16, h: 16 },
    crate: box('finished-crate', ROOM_AT['finished-crate']),
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
 * The room as sprites on the canvas: the wall and the floor to every edge, the rug and the firelight on the floor, what hangs on the
 * wall, the dressing and props on the floor (and at the edges of a wide window), the door, and an anvil for each cell owned and the
 * three props. The benches are not here: they stand in front of the smiths behind them, so they are drawn over those (`ForgeInside`).
 * `night` picks the palette; `fill` the variant of how the room fills the window (`art-variants.ts`).
 */
export function interiorSceneDraw(
  owned: number,
  slots: number,
  night: boolean,
  fill: FillVariant = forgeFill(),
) {
  return (g: SceneGeometry): Placement[] => {
    const lay = interiorLayout(g, slots, fill);
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
    const put = (piece: InteriorPiece, x: number, y: number): Placement => ({
      sprite: sprite(piece),
      x: lay.ox + x,
      y: lay.oy + y,
    });
    const at = (piece: keyof typeof ROOM_AT & InteriorPiece): Placement =>
      put(piece, ROOM_AT[piece].x, ROOM_AT[piece].y);
    // What is in view (room x of the scene's left and right edges).
    const from = -lay.ox;
    const to = g.W - lay.ox;
    const seen = (piece: InteriorPiece, x: number): boolean =>
      x + PIECE_SIZE[piece].w > from && x < to;
    // The side walls' dressing (racks, narrow windows, lanterns), going outward.
    const wall = wallDressing(from, to);
    out.push(at('rug'), at('furnace-glow'));
    for (const d of wall) out.push(put(d.piece, d.x, d.y));
    out.push(at('window-2'), at('lantern-hanging'), at('hanging-tools'), at('shelf'));
    out.push(at('furnace'), at('door'), at('door-mat'));
    out.push(at('coal-heap'), at('cat'), at('woodpile'), at('sacks'), at('bucket'));
    out.push(at('quench-trough'), at('barrel-stack'));
    for (const d of EDGE_DRESSING) if (seen(d.piece, d.x)) out.push(put(d.piece, d.x, d.y));
    out.push(at('gear-rack'));
    out.push(
      ...lay.cells.slice(0, owned).map((c) => ({ sprite: ANVIL_PROP, x: c.anvil.x, y: c.anvil.y })),
      at('plans-board'),
      { sprite: CHEST_PROP, x: lay.chest.x, y: lay.chest.y },
      at('finished-crate'),
    );
    return out;
  };
}
