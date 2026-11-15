/**
 * A furniture set in a room at real size (`docs/design/housing-workshop.md`, "The room sheet"): the set's nine pieces
 * placed on the spots of real room kinds, on the set's wallpaper and floor, with a housemate in the bed and one
 * standing by the table, exactly as the house scene places them. Pure: it returns placements in scene pixels; the
 * `pnpm housing sheet <set> --room` command paints them.
 *
 * The geometry is the house scene's (`housing/house-scene.ts`). It is repeated here, not imported, because the scene
 * loads every art pack through Vite's glob and the workshop runs under plain Node; a test keeps the two equal.
 */
import type { PieceArt } from '../../housing/house-art';
import { expandRows, type SpriteDef } from '../sprite-data';
import type { FormId } from './style';

/** The house scene's room geometry (scene pixels): `house-scene.ts` exports the same numbers. */
export const ROOM_GEOMETRY = {
  cellW: 112,
  cellH: 64,
  wallH: 52,
  floorH: 8,
  slabH: 4,
  wallT: 4,
  /** The row floor pieces stand on (their bottom edge), from the room's top. */
  feet: 58,
  /** The row a rug's bottom edge lies on. */
  rugFeet: 59,
} as const;

/** The spot types a set's forms go on, with the box height the scene gives each (`SPOT_H` in `house-scene.ts`). */
export const SPOT_HEIGHT = {
  window: 28,
  'wall-large': 22,
  'wall-small': 18,
  ceiling: 20,
  'floor-large': 40,
  'floor-small': 22,
  rug: 12,
} as const;

export type SetSpotType = keyof typeof SPOT_HEIGHT;

/** A spot of a room kind (`rooms.json`): its column and width, and its row for wall and ceiling spots. */
export interface RoomSpot {
  id: string;
  type: string;
  x: number;
  w: number;
  y?: number | undefined;
}

/** A room kind's layout (`rooms.json`): its width in cells and its spots. */
export interface RoomLayout {
  id: string;
  cells: number;
  spots: readonly RoomSpot[];
}

export interface Placement {
  sprite: SpriteDef;
  x: number;
  y: number;
}

/** Where a piece ended up: its box in scene pixels, the spot it stands on and the background it sits on. */
export interface PlacedPiece {
  form: FormId;
  room: number;
  spot: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** What is behind it: the wallpaper (wall, window and ceiling pieces, and what stands in front of the wall) or the floor (the rug). */
  on: 'wall' | 'floor';
}

export interface SetRoom {
  width: number;
  height: number;
  /** Painted in order: paper, floor, slab, rugs, wall things, floor pieces, the housemates, fronts, walls. */
  placements: Placement[];
  pieces: PlacedPiece[];
}

export interface SetRoomInput {
  /** The room kind every room uses (a one-cell room with a window, a large and a small wall spot, a ceiling, a large and two small floor spots and a rug). */
  layout: RoomLayout;
  /** Which form goes on each room's large floor spot, one room each (default bed, table, cupboard). */
  floorLarge?: readonly FormId[];
  pieces: Readonly<Record<FormId, PieceArt>>;
  wall: SpriteDef;
  floor: SpriteDef;
  slab: SpriteDef;
  /** The wall between rooms and at the ends: the house's walls skin tile. */
  walls: SpriteDef;
  /** A 16x16 creature: asleep in the bed and standing by the cupboard. */
  creature: SpriteDef;
}

const INK = '#0d0a1a';

/** The room kind the sheet furnishes (one cell: a window, a large and a small wall spot, a ceiling, a large and two small floor spots, a rug). */
export const SHOW_ROOM = 'kitchen';
/** The species standing in for scale. */
export const SHOW_CREATURE = 'sproutle';

/** The form each spot type of a room takes; `floor-small` takes the stool, `floor-large` the room's own. */
const FORM_OF: Readonly<Record<string, FormId | undefined>> = {
  window: 'curtains',
  'wall-large': 'shelf',
  'wall-small': 'frame',
  ceiling: 'lamp',
  'floor-small': 'stool',
  rug: 'rug',
};

function size(def: SpriteDef): { w: number; h: number } {
  const rows = expandRows(def);
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** A tile repeated over a box, cropped at its right and bottom edges. */
function tiled(
  out: Placement[],
  tile: SpriteDef,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const t = size(tile);
  const rows = expandRows(tile);
  for (let ty = 0; ty < h; ty += t.h) {
    for (let tx = 0; tx < w; tx += t.w) {
      const cw = Math.min(t.w, w - tx);
      const ch = Math.min(t.h, h - ty);
      const sprite =
        cw === t.w && ch === t.h
          ? tile
          : { rows: rows.slice(0, ch).map((r) => r.slice(0, cw)), palette: tile.palette };
      out.push({ sprite, x: x + tx, y: y + ty });
    }
  }
}

/** One colour block. */
function block(w: number, h: number, colour: string): SpriteDef {
  return { rows: Array.from({ length: h }, () => 'c'.repeat(w)), palette: { c: colour } };
}

/** The rooms of a set side by side, furnished, with the walls between them. */
export function setRoom(input: SetRoomInput): SetRoom {
  const g = ROOM_GEOMETRY;
  const big = input.floorLarge ?? (['bed', 'table', 'cupboard'] as const);
  const roomW = input.layout.cells * g.cellW;
  const width = big.length * roomW + g.wallT;
  const height = g.cellH;
  const back: Placement[] = [];
  const mid: Placement[] = [];
  const front: Placement[] = [];
  const walls: Placement[] = [];
  const pieces: PlacedPiece[] = [];
  const order = (type: string): number =>
    type === 'rug' ? 0 : type === 'floor-large' ? 2 : type === 'floor-small' ? 3 : 1;
  for (const [i, bigForm] of big.entries()) {
    const x0 = g.wallT / 2 + i * roomW;
    tiled(back, input.wall, x0, 0, roomW, g.wallH);
    tiled(back, input.floor, x0, g.wallH, roomW, g.floorH);
    tiled(back, input.slab, x0, g.wallH + g.floorH, roomW, g.slabH);
    let small = 0;
    const spots = [...input.layout.spots].sort((a, b) => order(a.type) - order(b.type));
    for (const spot of spots) {
      const form = spot.type === 'floor-large' ? bigForm : FORM_OF[spot.type];
      if (form === undefined) continue;
      // the stools go only by the table, both small spots
      if (spot.type === 'floor-small' && (bigForm !== 'table' || small++ > 1)) continue;
      const art = input.pieces[form];
      const s = size(art.sprite);
      const px = x0 + spot.x + Math.floor((spot.w - s.w) / 2);
      const py =
        spot.type === 'rug'
          ? g.rugFeet - s.h
          : spot.type === 'floor-large' || spot.type === 'floor-small'
            ? g.feet - s.h
            : (spot.y ?? 0);
      (spot.type === 'floor-small' ? front : mid).push({ sprite: art.sprite, x: px, y: py });
      pieces.push({
        form,
        room: i,
        spot: spot.id,
        x: px,
        y: py,
        w: s.w,
        h: s.h,
        on: spot.type === 'rug' ? 'floor' : 'wall',
      });
      if (form === 'bed') {
        const at = art.sleep ?? { x: Math.floor((s.w - 16) / 2), y: 2 };
        mid.push({ sprite: input.creature, x: px + at.x, y: py + at.y });
      }
      if (form === 'cupboard') {
        // a housemate standing by the cupboard, for scale
        mid.push({ sprite: input.creature, x: px + s.w + 4, y: g.feet - 16 });
      }
      if (art.front !== undefined) front.push({ sprite: art.front, x: px, y: py });
    }
    // the wall left of this room (and right of the last)
    for (const wx of i === big.length - 1 ? [x0 - 2, x0 + roomW - 2] : [x0 - 2]) {
      walls.push({ sprite: block(1, height, INK), x: wx, y: 0 });
      tiled(walls, input.walls, wx + 1, 0, 2, height);
      walls.push({ sprite: block(1, height, INK), x: wx + 3, y: 0 });
    }
  }
  return { width, height, placements: [...back, ...mid, ...front, ...walls], pieces };
}

/** The integer scale a phone draws a focused one-cell room at (`focusScale` in `RoomFocus.tsx`, for a 390 px screen). */
export function phoneRoomScale(roomWidth: number, screen = 390): number {
  return Math.min(4, Math.max(2, Math.floor((screen + 12 - 24) / Math.max(1, roomWidth))));
}

/** The scale the catalogue draws a piece at: the largest up to 3 that fits a 40 px tile (`fitScale` in `house-icon.tsx`). */
export function catalogueScale(sprite: SpriteDef, box = 40, max = 3): number {
  const s = size(sprite);
  return Math.max(1, Math.min(max, Math.floor(box / Math.max(s.w, s.h, 1))));
}
