/**
 * The house as one picture (`docs/design/housing.md` 2.4 and 4.4): pure composition of the cutaway dollhouse, no canvas and
 * no DOM. `composeHouse` turns a `HouseView` into layered placements of sprites in scene pixels (sky, ground, the walls, slabs
 * and roofs of the building, then every room: wallpaper, floor, rug, back pieces, displays, the housemate asleep in its bed,
 * the front layers and the small floor pieces) plus the boxes a screen needs to put buttons over it (rooms, spots, fixtures).
 * `composeRoom` is the same for one room alone (the focus view). `housePreview` is the same for a house with one more
 * part, drawn at scale 1 by the build panel.
 *
 * The geometry, all in scene pixels: a room cell is 112 x 64 (52 of wall, 8 of floor, a 4 slab); the walls (4 thick) straddle
 * the cell edges; floor 0 stands on the ground line `groundY`, whose single bright lawn row is the walking surface; the cellar
 * (floor -1) is sunk into the earth below it; roofs sit on the top of each run of columns that share a top floor. Everything is
 * built from whole sprite pixels, so the picture is drawn at an integer scale and stays crisp.
 */
import {
  houseGrid,
  housing,
  type DisplayView,
  type GridRoom,
  type HousemateView,
  type HouseView,
  type HousingContent,
  type PartDef,
  type RoomKindDef,
  type SpotDef,
  type SpotType,
} from '@creatures/game';
import { shinyPalette } from '../art';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { expandRows, spriteSize, swapPalette, type SpriteDef } from '../sprites/sprite-data';
import { skySprite } from '../valley/place-scene';
import { displayArt, pieceArt, shellArt, skinArt, type SkinArt } from './house-art';

export const CELL_W = 112;
export const CELL_H = 64;
/** The wall of a room above its floor strip. */
export const WALL_H = 52;
export const FLOOR_H = 8;
export const SLAB_H = 4;
/** Thickness of a wall; it straddles the cell edge (2 px each side). */
export const WALL_T = 4;
/** Grass left of the building (the door stands on it). */
export const SIDE = 16;
/** Grass right of the building: the workbench and the mailbox stand on it. */
export const YARD_END = 64;
/** Sky above the highest roof or chimney. */
export const SKY_ABOVE = 40;
/** The roofs overhang the outer walls by this much. */
export const OVERHANG = 6;
/** The row of the floor strip floor pieces stand on (their bottom edge), from the room's top. */
export const FEET = 58;
/** The row a rug's bottom edge lies on. */
export const RUG_FEET = 59;
/** Outdoors: pieces stand this far below the ground line (a little into the lawn). */
export const OUT_FEET = 3;
const INK = '#0d0a1a';

/** A sprite at a place; `w` and `h` crop the sprite to its top left corner (tiles at an edge). */
export interface Placement {
  sprite: SpriteDef;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** A room's box in scene pixels (walls included for indoor rooms). */
export interface SceneRoom {
  roomId: string;
  kind: string;
  /** The room kind's name ("Trophy Hall"). */
  name: string;
  outdoor: boolean;
  floor: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A spot of a room: its hit box in scene pixels, and what stands on it. */
export interface SceneSpot {
  roomId: string;
  spotId: string;
  type: SpotType;
  /** Left of the spot's own column (the spot's `x` in room pixels, plus the room's left edge). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The placed piece, or null (empty, or a display). */
  pieceId: string | null;
  /** A display spot: what it shows (null: the display has no data in this house view). */
  display: DisplayView | null;
}

export interface SceneCreature {
  roomId: string;
  spotId: string;
  /** The creature's 16 x 16 top left in scene pixels. */
  x: number;
  y: number;
  housemate: HousemateView;
  /** The sprite as drawn in the bed (shiny palette applied). */
  sprite: SpriteDef;
}

export interface SceneFixture {
  kind: 'workbench' | 'mailbox' | 'door';
  roomId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneModel {
  /** The scene's size in scene pixels. */
  width: number;
  height: number;
  /** The row of the lawn's bright top: floor 0 stands on it. */
  groundY: number;
  /** The building's box (walls and roofs). */
  box: { x: number; y: number; w: number; h: number };
  /** Everything up to the housemates (and the creatures themselves when `creatures` is 'draw'). */
  back: Placement[];
  /** The bed and sofa fronts and the small floor pieces: over the housemates. */
  front: Placement[];
  rooms: SceneRoom[];
  spots: SceneSpot[];
  creatures: SceneCreature[];
  fixtures: SceneFixture[];
  /** The Hearth's floor, in scene pixels: where the overview starts. */
  start: { x: number; y: number };
}

export interface ComposeOptions {
  content?: HousingContent;
  /** The scene is at least this wide (scene pixels): the lawn, earth and sky go on to both edges. */
  minWidth?: number;
  /** `draw`: housemates are painted into `back` (the overview); `skip`: only listed in `creatures` (the focus view draws buttons). */
  creatures?: 'draw' | 'skip';
  /** Parts built on top of the house's own (the build panel's preview); their rooms are empty. */
  extraBuilt?: readonly string[];
  /** Gifts wait in the mailbox: its flag is up. Otherwise (and in every visit) the flag is down. */
  mailWaiting?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Small drawing helpers

const solids = new Map<string, SpriteDef>();

/** A flat `w` x `h` block of one colour. */
export function solid(w: number, h: number, colour: string): SpriteDef {
  const key = `${String(w)}x${String(h)}${colour}`;
  let s = solids.get(key);
  if (s === undefined) {
    s = { rows: Array.from({ length: h }, () => 'c'.repeat(w)), palette: { c: colour } };
    solids.set(key, s);
  }
  return s;
}

/** Fills the rectangle with a tile repeated both ways (the tile's top left at the rectangle's top left). */
export function tileFill(
  out: Placement[],
  tile: SpriteDef,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const { width: tw, height: th } = spriteSize(tile);
  for (let dy = 0; dy < h; dy += th) {
    for (let dx = 0; dx < w; dx += tw) {
      const cw = Math.min(tw, w - dx);
      const ch = Math.min(th, h - dy);
      out.push(
        cw === tw && ch === th
          ? { sprite: tile, x: x + dx, y: y + dy }
          : { sprite: tile, x: x + dx, y: y + dy, w: cw, h: ch },
      );
    }
  }
}

/** The 3 x 5 digits of the plaques' rank plate and the depth marker. */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

const digitSprites = new Map<string, SpriteDef>();

/** A number in 3 x 5 digits one pixel apart (capped at 999). */
export function digitsSprite(n: number, colour: string): SpriteDef {
  const text = String(Math.min(999, Math.max(0, Math.floor(n))));
  const key = `${text}${colour}`;
  let sprite = digitSprites.get(key);
  if (sprite === undefined) {
    const rows = [0, 1, 2, 3, 4].map((y) =>
      [...text].map((ch) => (DIGITS[ch]?.[y] ?? '...').replaceAll('#', 'd')).join('.'),
    );
    sprite = { rows, palette: { d: colour } };
    digitSprites.set(key, sprite);
  }
  return sprite;
}

/** Replaces the keys of a sprite by `palette` entries it has (a no-op for others). */
function recolour(sprite: SpriteDef, palette: Readonly<Record<string, string>>): SpriteDef {
  return swapPalette(sprite, palette);
}

// ---------------------------------------------------------------------------------------------
// Roofs

const roofCache = new Map<string, SpriteDef>();

/** The base width of a roof over `cells` cells starting at column `col` (walls and overhang included). */
export function roofBase(cells: number): number {
  return cells * CELL_W + WALL_T + 2 * OVERHANG;
}

export interface RoofShape {
  /** Whole sprite size. */
  width: number;
  height: number;
  /** Width of the flat top row. */
  top: number;
}

/** Rows of the eave that overhang the walls at the bottom of a roof (full width). */
const EAVE_ROWS = 4;

/**
 * A roof of two sloping sides (2 px across for every row down) over `base` px, with the eave's four rows at full width under
 * the slopes. `gable` rises to a short ridge, `hip` is a low trapezoid (20 rows). Pure arithmetic: the base is kept, so the
 * top width is whatever is left.
 */
export function roofShape(base: number, kind: 'gable' | 'hip'): RoofShape {
  const rows = kind === 'gable' ? Math.max(8, Math.floor((base - 16) / 4) + EAVE_ROWS) : 20;
  return { width: base, height: rows, top: base - 4 * (rows - EAVE_ROWS) };
}

/** Pixels the slope has left to cover at the left of row `r` (a roof's rows above the eave). */
function slopeInset(shape: RoofShape, r: number): number {
  return Math.max(0, 2 * (shape.height - EAVE_ROWS - r));
}

/** One roof as a sprite: the skin's tile in the slope's shape, the ridge on top, the eave along the bottom, ink on the slopes. */
export function roofSprite(
  skin: SkinArt,
  base: number,
  kind: 'gable' | 'hip',
  glass = false,
): SpriteDef {
  const key = `${String(base)}|${kind}|${glass ? 'glass' : ''}|${skin.tile.rows[0] ?? ''}${Object.values(skin.tile.palette).join('')}`;
  const hit = roofCache.get(key);
  if (hit !== undefined) return hit;
  const tint = glass
    ? { L: '#d8f4ff', M: '#9fd8ee', D: '#6fb2d6', A: '#4a96c0', B: '#ffffff' }
    : {};
  const tile = glass ? recolour(skin.tile, tint) : skin.tile;
  const ridge =
    skin.ridge === undefined ? undefined : glass ? recolour(skin.ridge, tint) : skin.ridge;
  const eave = skin.eave === undefined ? undefined : glass ? recolour(skin.eave, tint) : skin.eave;
  const shape = roofShape(base, kind);
  // Characters by colour, so sprites that reuse a key for another colour still draw right.
  const chars = new Map<string, string>();
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const palette: Record<string, string> = {};
  const charOf = (colour: string): string => {
    let ch = chars.get(colour);
    if (ch === undefined) {
      ch = letters[chars.size] ?? 'z';
      chars.set(colour, ch);
      palette[ch] = colour;
    }
    return ch;
  };
  const ink = charOf(INK);
  const rowsOf = (s: SpriteDef | undefined): { rows: string[]; w: number } | undefined => {
    if (s === undefined) return undefined;
    const expanded =
      s.mirror === true ? s.rows.map((r) => r + [...r].reverse().join('')) : [...s.rows];
    return { rows: expanded, w: expanded[0]?.length ?? 0 };
  };
  const pick = (
    src: { rows: string[]; w: number } | undefined,
    sprite: SpriteDef | undefined,
    px: number,
    py: number,
  ): string => {
    if (src === undefined || sprite === undefined || src.w === 0) return '.';
    const ch = src.rows[py % src.rows.length]?.[px % src.w] ?? '.';
    if (ch === '.') return '.';
    const colour = sprite.palette[ch];
    return colour === undefined ? '.' : charOf(colour);
  };
  const tileRows = rowsOf(tile);
  const ridgeRows = rowsOf(ridge);
  const eaveRows = rowsOf(eave);
  const rows: string[] = [];
  for (let r = 0; r < shape.height; r++) {
    const eaveRow = r >= shape.height - EAVE_ROWS;
    const start = eaveRow ? 0 : slopeInset(shape, r);
    const end = base - start;
    const line: string[] = Array.from({ length: base }, () => '.');
    for (let x = start; x < end; x++) {
      let ch: string;
      if (eaveRow && eaveRows !== undefined)
        ch = pick(eaveRows, eave, x, r - (shape.height - EAVE_ROWS));
      else if (r < 4 && ridgeRows !== undefined) ch = pick(ridgeRows, ridge, x, r);
      else ch = pick(tileRows, tile, x, r);
      line[x] = ch;
    }
    if (!eaveRow) {
      // The slopes are inked: two pixels at each end of a row make a one pixel line down a 2:1 slope.
      for (let k = 0; k < 2; k++) {
        if (start + k < end) line[start + k] = ink;
        if (end - 1 - k >= start) line[end - 1 - k] = ink;
      }
    }
    rows.push(line.join(''));
  }
  const sprite: SpriteDef = { rows, palette };
  roofCache.set(key, sprite);
  return sprite;
}

/** The row, counting from the top of a roof, where a point `x` px from the roof's left edge first meets its slope. */
export function roofRowAt(shape: RoofShape, x: number): number {
  for (let r = 0; r < shape.height - EAVE_ROWS; r++) {
    const inset = slopeInset(shape, r);
    if (x >= inset + 2 && x <= shape.width - inset - 2) return r;
  }
  return shape.height - EAVE_ROWS;
}

// ---------------------------------------------------------------------------------------------
// Where spots stand

/** The height of a spot's hit box, by type (the tallest piece its form allows, roughly). */
const SPOT_H: Readonly<Record<SpotType, number>> = {
  window: 28,
  'wall-large': 22,
  'wall-small': 18,
  ceiling: 20,
  'floor-large': 40,
  'floor-small': 22,
  rug: 12,
  display: 34,
  'yard-large': 42,
  'yard-small': 22,
  fence: 14,
  poolside: 22,
  water: 12,
  porch: 30,
};

const FLOOR_TYPES: ReadonlySet<SpotType> = new Set(['floor-large', 'floor-small', 'rug']);
const YARD_TYPES: ReadonlySet<SpotType> = new Set([
  'yard-large',
  'yard-small',
  'fence',
  'poolside',
  'water',
  'porch',
]);

/** Where a spot's box is: x and width from the room's left edge, the top (wall spots: their own y; floor and yard spots: standing). */
export function spotBox(
  spot: SpotDef,
  outdoor: boolean,
  roomTop: number,
  groundY: number,
): { x: number; y: number; w: number; h: number } {
  const h = SPOT_H[spot.type];
  const feet =
    spot.type === 'rug'
      ? roomTop + RUG_FEET
      : outdoor
        ? groundY + (spot.type === 'water' ? 9 : OUT_FEET)
        : roomTop + FEET;
  if (spot.y !== undefined && !FLOOR_TYPES.has(spot.type) && !YARD_TYPES.has(spot.type)) {
    return { x: spot.x, y: roomTop + spot.y, w: spot.w, h };
  }
  return { x: spot.x, y: feet - h, w: spot.w, h };
}

// ---------------------------------------------------------------------------------------------
// The composition

interface Frame {
  content: HousingContent;
  kinds: Map<string, RoomKindDef>;
  parts: Map<string, PartDef>;
  house: HouseView;
  rooms: Map<string, HouseView['rooms'][number]>;
  displays: DisplayView[];
  drawCreatures: boolean;
}

function frameOf(house: HouseView, options: ComposeOptions): Frame {
  const content = options.content ?? housing;
  return {
    content,
    kinds: new Map(content.rooms.map((r) => [r.id, r])),
    parts: new Map(content.parts.map((p) => [p.id, p])),
    house,
    rooms: new Map(house.rooms.map((r) => [r.id, r])),
    displays: house.displays,
    drawCreatures: (options.creatures ?? 'draw') === 'draw',
  };
}

function emptyRoom(room: GridRoom, kind: RoomKindDef): HouseView['rooms'][number] {
  return {
    id: room.roomId,
    kind: room.kind,
    wall: kind.wall,
    floor: kind.floor,
    spots: {},
  };
}

/** Wall and floor skin tiles of a room (with grey stand-ins when a skin has no art). */
function tilesOf(content: HousingContent, id: string, kind: string): SkinArt {
  const def = content.skins.find((s) => s.id === id);
  return skinArt(id, def?.kind ?? kind);
}

interface Layers {
  back: Placement[];
  front: Placement[];
  spots: SceneSpot[];
  creatures: SceneCreature[];
  fixtures: SceneFixture[];
}

/** Draws the digits of `n` in the plaque's rank plate. */
function plaque(
  layers: Layers,
  x: number,
  y: number,
  bossId: string,
  rank: number,
  bossSprite: SpriteDef | null,
): void {
  layers.back.push({ sprite: displayArt('plaque'), x, y });
  if (bossSprite !== null) layers.back.push({ sprite: bossSprite, x: x + 2, y: y + 1 });
  const digits = digitsSprite(rank, INK);
  const w = spriteSize(digits).width;
  layers.back.push({ sprite: digits, x: x + 6 + Math.floor((16 - w) / 2), y: y + 26 });
  void bossId;
}

/** The board colours of a boss not beaten yet: a lit edge round a body only a shade lighter than the board. */
const OUTLINE_EDGE = '#c9c2ec';
const OUTLINE_BODY = '#3d3670';

/**
 * A boss as an outline: the same shape in two colours, a bright edge (every pixel that touches the picture's border or a
 * clear pixel) round a body a shade lighter than the dark plaque board, so the shape reads at a glance on it. Pure.
 */
export function bossOutline(sprite: SpriteDef): SpriteDef {
  const rows = expandRows(sprite);
  const solidAt = (x: number, y: number): boolean => {
    const c = rows[y]?.[x];
    return c !== undefined && c !== '.';
  };
  return {
    palette: { e: OUTLINE_EDGE, b: OUTLINE_BODY },
    rows: rows.map((row, y) =>
      [...row]
        .map((c, x) => {
          if (c === '.') return '.';
          const edge =
            !solidAt(x - 1, y) || !solidAt(x + 1, y) || !solidAt(x, y - 1) || !solidAt(x, y + 1);
          return edge ? 'e' : 'b';
        })
        .join(''),
    ),
  };
}

/** Tiny marks in a row: `n` squares (at most `max`) of one colour, `gap` apart, starting at (x, y). */
function marks(
  layers: Layers,
  out: 'back' | 'front',
  x: number,
  y: number,
  n: number,
  max: number,
  colour: string,
  size = 3,
): void {
  for (let i = 0; i < Math.min(n, max); i++) {
    layers[out].push({ sprite: solid(size, size, colour), x: x + i * (size + 1), y });
  }
}

const GOLD = '#ffd25a';
const SILVER = '#d4d8e4';
const BRONZE = '#c98a5a';

/** What a display spot draws in its slot. `boss` gives the 24 x 24 art of a raid boss. */
export interface DisplayDrawing {
  bossSprite: (bossId: string) => SpriteDef | null;
  keepsake: (setId: string) => SpriteDef | undefined;
}

function drawDisplay(
  layers: Layers,
  spot: SpotDef,
  left: number,
  top: number,
  floorY: number,
  data: DisplayView | null,
  drawing: DisplayDrawing,
): void {
  if (spot.display === undefined) return;
  const slotX = left + spot.x;
  const slotW = spot.w;
  const centred = (w: number): number => slotX + Math.floor((slotW - w) / 2);
  const hang = top + (spot.y ?? 8);
  switch (spot.display) {
    case 'raid-plaques': {
      const d = data?.kind === 'raid-plaques' ? data : null;
      const plaques =
        d === null ? [] : [...d.plaques].sort((a, b) => b.best - a.best || b.wins - a.wins);
      const best = plaques[0];
      if (best !== undefined) {
        plaque(layers, centred(28), hang, best.bossId, best.best, drawing.bossSprite(best.bossId));
        if (spot.layout === 'row') {
          // one pip under the board for every boss beaten
          marks(
            layers,
            'back',
            centred(Math.min(plaques.length, 5) * 4 - 1),
            hang + 35,
            plaques.length,
            5,
            GOLD,
          );
        }
      } else {
        const board = centred(28);
        layers.back.push({ sprite: displayArt('plaque-empty'), x: board, y: hang });
        // This week's boss, outlined on the empty board: the one to beat.
        const next = d?.current === null || d === null ? null : drawing.bossSprite(d.current);
        if (next !== null) {
          layers.back.push({ sprite: bossOutline(next), x: board + 2, y: hang + 1 });
        }
      }
      return;
    }
    case 'games-medals': {
      const bench = displayArt('bench');
      const { width: bw, height: bh } = spriteSize(bench);
      const bx = centred(bw);
      const by = floorY - bh;
      layers.back.push({ sprite: bench, x: bx, y: by });
      if (data?.kind === 'games-medals') {
        marks(layers, 'back', bx + 2, by - 4, data.gold, 5, GOLD);
        marks(layers, 'back', bx + 2, by - 8, data.silver, 5, SILVER);
        marks(layers, 'back', bx + 2, by - 12, data.bronze, 5, BRONZE);
      }
      return;
    }
    case 'games-badges': {
      const slot = displayArt('badge-slot');
      const { width: sw } = spriteSize(slot);
      const events = data?.kind === 'games-badges' ? data.events.length : 0;
      const n = Math.max(1, Math.min(2, events));
      const total = n * sw + (n - 1);
      for (let i = 0; i < n; i++)
        layers.back.push({
          sprite: slot,
          x: slotX + Math.floor((slotW - total) / 2) + i * (sw + 1),
          y: hang + 2,
        });
      if (events > 2)
        marks(
          layers,
          'back',
          centred(Math.min(events - 2, 5) * 4 - 1),
          hang + 16,
          events - 2,
          5,
          GOLD,
        );
      return;
    }
    case 'festival': {
      const art = displayArt('case');
      layers.back.push({ sprite: art, x: centred(spriteSize(art).width), y: hang });
      const n = data?.kind === 'festival' ? data.species.length : 0;
      marks(
        layers,
        'back',
        centred(Math.min(n, 5) * 4 - 1),
        hang + spriteSize(art).height + 2,
        n,
        5,
        GOLD,
      );
      return;
    }
    case 'keepsakes': {
      const art = displayArt('shelf');
      layers.back.push({ sprite: art, x: centred(spriteSize(art).width), y: hang + 14 });
      if (data?.kind === 'keepsakes') {
        const tones = ['#e8c070', '#6fc4dc', '#9ccc6c', '#d98cc0', '#f6e6a0', '#ff8a5a'];
        data.places.slice(0, 6).forEach((p, i) => {
          const colour = tones[i % tones.length] ?? GOLD;
          layers.back.push({
            sprite: solid(3, Math.min(8, 3 + p.count), colour),
            x: slotX + 2 + i * 4,
            y: hang + 14 - Math.min(8, 3 + p.count),
          });
        });
      }
      return;
    }
    case 'journal': {
      const art = displayArt('books');
      layers.back.push({ sprite: art, x: centred(spriteSize(art).width), y: hang + 4 });
      return;
    }
    case 'dungeon': {
      const art = displayArt('marker');
      const { width: mw, height: mh } = spriteSize(art);
      const mx = centred(mw);
      const my = floorY - mh;
      layers.back.push({ sprite: art, x: mx, y: my });
      if (data?.kind === 'dungeon') {
        const digits = digitsSprite(data.depth, '#f4eedc');
        layers.back.push({
          sprite: digits,
          x: mx + Math.floor((mw - spriteSize(digits).width) / 2),
          y: my + 6,
        });
      }
      return;
    }
    case 'set-keepsakes': {
      const art = displayArt('cabinet');
      const { width: cw, height: ch } = spriteSize(art);
      const cx = centred(cw);
      const cy = floorY - ch;
      layers.back.push({ sprite: art, x: cx, y: cy });
      if (data?.kind === 'set-keepsakes') {
        // The cabinet is about 22 px wide inside: the first keepsake at full size, the rest as small marks under it.
        const [first, ...rest] = data.sets;
        if (first !== undefined) {
          const keep = drawing.keepsake(first);
          if (keep !== undefined) {
            layers.back.push({
              sprite: keep,
              x: cx + Math.floor((cw - spriteSize(keep).width) / 2),
              y: cy + 6,
            });
          } else {
            layers.back.push({
              sprite: solid(6, 6, GOLD),
              x: cx + Math.floor((cw - 6) / 2),
              y: cy + 9,
            });
          }
        }
        marks(layers, 'back', cx + 4, cy + 21, rest.length, 5, GOLD);
      }
      return;
    }
  }
}

/** Housemate sprite, in the bed's pixels. */
function housemateSprite(species: string, shiny: boolean): SpriteDef {
  const base = creatureSpriteOrFallback(species);
  const palette = shiny ? shinyPalette(species) : undefined;
  return palette === undefined ? base : swapPalette(base, palette);
}

const DEFAULT_DRAWING: DisplayDrawing = {
  bossSprite: () => null,
  keepsake: () => undefined,
};

/** One room: paper, floor, walls, slab and everything on its spots. (x, y) is the top left of the cell box (walls straddle it). */
function drawRoom(
  frame: Frame,
  layers: Layers,
  room: GridRoom,
  kind: RoomKindDef,
  view: HouseView['rooms'][number],
  x: number,
  y: number,
  groundY: number,
  drawing: DisplayDrawing,
  outer: { left: boolean; right: boolean } = { left: false, right: false },
): void {
  const { content } = frame;
  const width = room.w * CELL_W;
  const { back, front } = layers;
  const spotsOf = view.spots;
  if (!room.outdoor) {
    // paper, floor, slab
    tileFill(back, tilesOf(content, view.wall, 'wall').tile, x, y, width, WALL_H);
    tileFill(back, tilesOf(content, view.floor, 'floor').tile, x, y + WALL_H, width, FLOOR_H);
    tileFill(back, shellArt('slab'), x, y + WALL_H + FLOOR_H, width, SLAB_H);
  }
  const floorY = y + FEET;
  // (The workbench and the mailbox are not in a room: they stand in the yard, see `composeHouse`.)
  void kind.fixtures;
  if (room.kind === 'cellar') {
    const vent = shellArt('vent');
    const { width: w } = spriteSize(vent);
    back.push(
      { sprite: vent, x: x + 12, y: y + 6 },
      { sprite: vent, x: x + width - 12 - w, y: y + 6 },
    );
  }
  // rug first, under everything that stands
  const ordered = [...kind.spots].sort((a, b) => order(a.type) - order(b.type));
  for (const spot of ordered) {
    const pieceId = spot.type === 'display' ? null : (spotsOf[spot.id] ?? null);
    const box = spotBox(spot, room.outdoor, y, groundY);
    const data =
      spot.type === 'display'
        ? (frame.displays.find((d) => d.roomId === room.roomId && d.spotId === spot.id) ?? null)
        : null;
    layers.spots.push({
      roomId: room.roomId,
      spotId: spot.id,
      type: spot.type,
      x: x + box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      pieceId,
      display: data,
    });
    if (spot.type === 'display') {
      drawDisplay(layers, spot, x, y, floorY, data, drawing);
      continue;
    }
    if (pieceId === null) continue;
    const art = pieceArt(pieceId, content);
    const { width: pw, height: ph } = spriteSize(art.sprite);
    const px = x + spot.x + Math.floor((spot.w - pw) / 2);
    let py: number;
    if (spot.type === 'rug') py = y + RUG_FEET - ph;
    else if (FLOOR_TYPES.has(spot.type)) py = floorY - ph;
    else if (YARD_TYPES.has(spot.type)) py = groundY + (spot.type === 'water' ? 9 : OUT_FEET) - ph;
    else py = y + (spot.y ?? 0);
    // small floor pieces stand in front of a housemate: they go on the front layer
    (spot.type === 'floor-small' ? front : back).push({ sprite: art.sprite, x: px, y: py });
    const piece = content.pieces.find((p) => p.id === pieceId);
    const form = piece === undefined ? undefined : content.forms.find((f) => f.id === piece.form);
    if (form?.bed === true) {
      const mate = frame.house.housemates.find(
        (h) => h.roomId === room.roomId && h.spotId === spot.id,
      );
      if (mate !== undefined && mate.home) {
        const anchor = art.sleep ?? { x: Math.floor((pw - 16) / 2), y: 2 };
        const sprite = housemateSprite(mate.creature.species, mate.creature.shiny);
        const cx = px + anchor.x;
        const cy = py + anchor.y;
        layers.creatures.push({
          roomId: room.roomId,
          spotId: spot.id,
          x: cx,
          y: cy,
          housemate: mate,
          sprite,
        });
        if (frame.drawCreatures) {
          back.push({ sprite, x: cx, y: cy });
          back.push({ sprite: shellArt('z'), x: cx + 12, y: cy - 8 });
        }
      }
    }
    if (art.front !== undefined) front.push({ sprite: art.front, x: px, y: py });
  }
  if (!room.outdoor) {
    drawWalls(frame, layers, x, y, width, outer);
  }
}

/** Draw order of spot types inside a room: the rug, wall and ceiling things, large floor pieces, small floor pieces. */
function order(type: SpotType): number {
  switch (type) {
    case 'rug':
      return 0;
    case 'window':
    case 'wall-large':
    case 'wall-small':
    case 'ceiling':
    case 'display':
      return 1;
    case 'floor-large':
      return 2;
    default:
      return 3;
  }
}

/** How thick the skin of an outer wall is (the cut edge of the building): three times an inner wall's. */
export const OUTER_SKIN = 6;

/**
 * The room's left and right walls: ink, the walls skin, ink; straddling the cell edge. An inner wall is two tile columns; the
 * outer wall of the building (no room beside it on that floor) is a thicker band of the skin, growing outwards, so the walls
 * the player chose (Timber, Fieldstone) show on the cut edge of the house.
 */
function drawWalls(
  frame: Frame,
  layers: Layers,
  x: number,
  y: number,
  width: number,
  outer: { left: boolean; right: boolean },
): void {
  const walls = skinArt(frame.house.exterior.walls, 'walls').tile;
  for (const side of ['left', 'right'] as const) {
    const wx = side === 'left' ? x - 2 : x + width - 2;
    const thick = outer[side];
    const skin = thick ? OUTER_SKIN : 2;
    // The inner face keeps its place (a room's inside does not shrink); an outer wall grows outwards.
    const from = side === 'left' ? (thick ? wx + 1 + 2 - skin : wx + 1) : wx + 1;
    const inkAt = side === 'left' ? [from - 1, wx + 3] : [wx, wx + 1 + skin];
    layers.front.push({ sprite: solid(1, CELL_H, INK), x: inkAt[0] ?? wx, y });
    tileFill(layers.front, walls, from, y, skin, CELL_H);
    layers.front.push({ sprite: solid(1, CELL_H, INK), x: inkAt[1] ?? wx + 3, y });
  }
}

/** The plinth under the ground floor: a band of the walls skin along the ground line, a little into the lawn. */
const PLINTH_ABOVE = 4;
const PLINTH_BELOW = 3;

interface Run {
  from: number;
  to: number;
  top: number;
  wing: boolean;
  glass: boolean;
}

/** The runs of columns that share a top floor and a kind of part, left to right. */
function runsOf(frame: Frame, rooms: readonly GridRoom[]): Run[] {
  const tops = new Map<number, { top: number; wing: boolean; glass: boolean }>();
  for (const room of rooms) {
    if (room.outdoor || room.floor < 0) continue;
    const part = frame.parts.get(room.part);
    const wing = part !== undefined && part.kind === 'wing';
    for (let c = room.col; c < room.col + room.w; c++) {
      const at = tops.get(c);
      if (at === undefined || room.floor > at.top) {
        tops.set(c, { top: room.floor, wing, glass: room.kind === 'conservatory' });
      }
    }
  }
  const cols = [...tops.keys()].sort((a, b) => a - b);
  const runs: Run[] = [];
  for (const col of cols) {
    const at = tops.get(col);
    if (at === undefined) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.to === col - 1 && last.top === at.top && last.wing === at.wing) {
      last.to = col;
      last.glass = last.glass && at.glass;
    } else runs.push({ from: col, to: col, top: at.top, wing: at.wing, glass: at.glass });
  }
  return runs;
}

/**
 * Composes the whole house. The scene is as wide as the building plus the grass, or `minWidth` when that is more (the
 * building then stands in the middle).
 */
export function composeHouse(
  house: HouseView,
  options: ComposeOptions & { drawing?: DisplayDrawing } = {},
): SceneModel {
  const frame = frameOf(house, options);
  const { content } = frame;
  const drawing = options.drawing ?? DEFAULT_DRAWING;
  const built = new Set([...house.built, ...(options.extraBuilt ?? [])]);
  const grid = houseGrid(content, built);
  const minCol = Math.min(0, ...grid.map((r) => r.col));
  const maxCol = Math.max(1, ...grid.map((r) => r.col + r.w));
  const contentW = (maxCol - minCol) * CELL_W + SIDE + WALL_T + YARD_END;
  const width = Math.max(contentW, Math.floor(options.minWidth ?? 0));
  const originX = SIDE + 2 - minCol * CELL_W + Math.floor((width - contentW) / 2);
  const runs = runsOf(frame, grid);
  // Roof geometry first: it decides the height.
  const roofs = runs.map((run) => {
    const cells = run.to - run.from + 1;
    const kind: 'gable' | 'hip' = run.wing ? 'hip' : 'gable';
    return { run, cells, kind, shape: roofShape(roofBase(cells), kind) };
  });
  let aboveGround = 0;
  for (const roof of roofs)
    aboveGround = Math.max(aboveGround, (roof.run.top + 1) * CELL_H + roof.shape.height);
  const chimneyRun = roofs.find((r) => r.run.from <= 0 && r.run.to >= 0 && !r.run.wing);
  const chimney = shellArt('chimney');
  const { height: chH } = spriteSize(chimney);
  let chimneyAbove = 0;
  let chimneyAt: { x: number; y: number } | null = null;
  const groundRel = (top: number): number => (top + 1) * CELL_H;
  if (chimneyRun !== undefined) {
    const baseX = originX + chimneyRun.run.from * CELL_W - 2 - OVERHANG;
    const local = Math.floor(chimneyRun.shape.width * 0.27);
    const row = roofRowAt(chimneyRun.shape, local);
    const bottomRel = groundRel(chimneyRun.run.top) + chimneyRun.shape.height - row - 4;
    chimneyAbove = bottomRel + chH;
    chimneyAt = { x: baseX + local, y: -bottomRel };
  }
  const topExtent = Math.max(aboveGround, chimneyAbove);
  const groundY = SKY_ABOVE + topExtent;
  const hasCellar = grid.some((r) => r.floor < 0);
  const belowGround = FLOOR_H + 16 + (hasCellar ? CELL_H : 0);
  const height = groundY + belowGround;

  const back: Placement[] = [];
  const front: Placement[] = [];
  const layers: Layers = { back, front, spots: [], creatures: [], fixtures: [] };

  // sky: the valley's strip along the ground line, its top row carried up
  const sky = skySprite();
  const { width: skyW, height: skyH } = spriteSize(sky);
  const skyTop = groundY - skyH;
  if (skyTop > 0) {
    back.push({
      sprite: solid(width, skyTop, sky.palette[sky.rows[0]?.[0] ?? ''] ?? '#6fb2d6'),
      x: 0,
      y: 0,
    });
  }
  for (let sx = 0; sx < width; sx += skyW) {
    const cw = Math.min(skyW, width - sx);
    back.push(
      cw === skyW
        ? { sprite: sky, x: sx, y: Math.max(0, skyTop) }
        : { sprite: sky, x: sx, y: Math.max(0, skyTop), w: cw, h: skyH },
    );
  }
  // ground: earth, then the lawn's single bright row over the whole width
  const earth = shellArt('earth');
  tileFill(back, earth, 0, groundY + FLOOR_H, width, belowGround - FLOOR_H);
  const lawn = tilesOf(content, 'lawn', 'ground').tile;
  tileFill(back, lawn, 0, groundY, width, FLOOR_H);

  // outdoor ground that is not lawn
  const rooms: SceneRoom[] = [];
  const kinds = frame.kinds;
  for (const room of grid) {
    const kind = kinds.get(room.kind);
    if (kind === undefined) continue;
    const x = originX + room.col * CELL_W;
    const y = groundY - (room.floor + 1) * CELL_H;
    if (room.outdoor) {
      const w = room.w * CELL_W;
      if (kind.floor === 'deck')
        tileFill(back, tilesOf(content, 'deck', 'ground').tile, x, groundY, w, FLOOR_H);
      if (kind.floor === 'pool-tile') drawPool(content, back, x, groundY, w);
      rooms.push({
        roomId: room.roomId,
        kind: room.kind,
        name: kind.name,
        outdoor: true,
        floor: room.floor,
        col: room.col,
        x,
        y: groundY - CELL_H,
        w,
        h: CELL_H + FLOOR_H,
      });
    } else {
      rooms.push({
        roomId: room.roomId,
        kind: room.kind,
        name: kind.name,
        outdoor: false,
        floor: room.floor,
        col: room.col,
        x: x - 2,
        y,
        w: room.w * CELL_W + WALL_T,
        h: CELL_H,
      });
    }
  }

  // The chimney and the roofs go down before the rooms: a taller room then hides the overhang of a lower roof beside it,
  // and the walls of a room never cut its own eave (the roof's last row is the row above the room).
  const roofSkin = skinArt(house.exterior.roof, 'roof');
  const indoor = grid.filter((r) => !r.outdoor);
  if (chimneyAt !== null) {
    back.push({ sprite: chimney, x: chimneyAt.x, y: groundY + chimneyAt.y - chH });
  }
  for (const roof of [...roofs].sort((a, b) => a.run.top - b.run.top)) {
    const x = originX + roof.run.from * CELL_W - 2 - OVERHANG;
    const y = groundY - (roof.run.top + 1) * CELL_H - roof.shape.height;
    const glass = roof.run.glass && roof.run.top === 0;
    back.push({ sprite: roofSprite(roofSkin, roof.shape.width, roof.kind, glass), x, y });
  }
  // A wall with no room beside it on its floor is the building's cut edge: it gets the thick band of the walls skin.
  const indoorAt = new Set(indoor.map((r) => `${String(r.floor)}:${String(r.col)}`));
  const outerOf = (room: GridRoom): { left: boolean; right: boolean } => ({
    left: !indoorAt.has(`${String(room.floor)}:${String(room.col - 1)}`),
    right: !indoorAt.has(`${String(room.floor)}:${String(room.col + room.w)}`),
  });
  const drawRoomAt = (room: GridRoom): void => {
    const kind = kinds.get(room.kind);
    if (kind === undefined) return;
    const view = frame.rooms.get(room.roomId) ?? emptyRoom(room, kind);
    drawRoom(
      frame,
      layers,
      room,
      kind,
      view,
      originX + room.col * CELL_W,
      groundY - (room.floor + 1) * CELL_H,
      groundY,
      drawing,
      room.outdoor ? undefined : outerOf(room),
    );
  };
  for (const room of grid.filter((r) => r.outdoor)) drawRoomAt(room);
  for (const room of [...indoor].sort((a, b) => a.floor - b.floor)) drawRoomAt(room);
  // The plinth: the walls skin along the ground line under every ground-floor room, ink above and below.
  const wallsTile = skinArt(house.exterior.walls, 'walls').tile;
  for (const room of indoor.filter((r) => r.floor === 0)) {
    const edge = outerOf(room);
    const left = originX + room.col * CELL_W - (edge.left ? OUTER_SKIN : 2);
    const right = originX + (room.col + room.w) * CELL_W + (edge.right ? OUTER_SKIN : 2);
    const top = groundY - PLINTH_ABOVE;
    const h = PLINTH_ABOVE + PLINTH_BELOW;
    front.push({ sprite: solid(right - left, 1, INK), x: left, y: top });
    tileFill(front, wallsTile, left, top + 1, right - left, h - 2);
    front.push({ sprite: solid(right - left, 1, INK), x: left, y: top + h - 1 });
  }

  // the door and the mailbox
  const fixtures = layers.fixtures;
  const westFree = !grid.some((r) => r.outdoor && r.col < 0);
  const leftIndoor = indoor.filter((r) => r.floor === 0).sort((a, b) => a.col - b.col)[0];
  if (westFree && leftIndoor !== undefined) {
    const door = shellArt('door');
    const { width: dw, height: dh } = spriteSize(door);
    const dx = originX + leftIndoor.col * CELL_W - 2 - (dw - WALL_T);
    const dy = groundY + 2 - dh;
    front.push({ sprite: door, x: dx, y: dy });
    fixtures.push({ kind: 'door', roomId: leftIndoor.roomId, x: dx, y: dy, w: dw, h: dh });
  }
  // The yard's end, right of the building (and of the grounds): the workbench, then the mailbox.
  const yardX = originX + maxCol * CELL_W + 2 + 8;
  const bench = shellArt('workbench');
  const { width: bw, height: bh } = spriteSize(bench);
  const by = groundY + 2 - bh;
  back.push({ sprite: bench, x: yardX, y: by });
  fixtures.push({ kind: 'workbench', roomId: null, x: yardX, y: by, w: bw, h: bh });
  const mail = shellArt(options.mailWaiting === true ? 'mailbox' : 'mailbox-empty');
  const { width: mw, height: mh } = spriteSize(mail);
  const mx = yardX + bw + 6;
  const my = groundY + 2 - mh;
  back.push({ sprite: mail, x: mx, y: my });
  fixtures.push({ kind: 'mailbox', roomId: null, x: mx, y: my, w: mw, h: mh });

  const hearth = rooms.find((r) => r.roomId === 'hut:hearth') ?? rooms[0];
  const boxLeft = originX + minCol * CELL_W - 2;
  const topY = Math.max(0, groundY - topExtent);
  return {
    width,
    height,
    groundY,
    box: {
      x: boxLeft,
      y: topY,
      w: (maxCol - minCol) * CELL_W + WALL_T,
      h: groundY - topY + (hasCellar ? CELL_H : 0),
    },
    back,
    front,
    rooms,
    spots: layers.spots,
    creatures: layers.creatures,
    fixtures,
    start: {
      x: hearth === undefined ? Math.floor(width / 2) : hearth.x + Math.floor(hearth.w / 2),
      y: groundY,
    },
  };
}

/** A pool: the coping along the ground line with a water-filled basin sunk under the three water spots. */
function drawPool(
  content: HousingContent,
  out: Placement[],
  x: number,
  groundY: number,
  w: number,
): void {
  tileFill(out, tilesOf(content, 'pool-tile', 'ground').tile, x, groundY, w, FLOOR_H);
  const bx = x + 34;
  const bw = 96;
  const depth = 28;
  const rim = tilesOf(content, 'pool-tile', 'ground').tile;
  const water = tilesOf(content, 'pool-water', 'ground').tile;
  tileFill(out, rim, bx, groundY + FLOOR_H, bw, depth - FLOOR_H);
  tileFill(out, water, bx + 3, groundY, bw - 6, depth - 3);
  for (const wx of [bx, bx + bw - 1]) out.push({ sprite: solid(1, depth, INK), x: wx, y: groundY });
  out.push({ sprite: solid(bw, 1, INK), x: bx, y: groundY + depth - 1 });
  out.push({ sprite: solid(1, depth - 3, INK), x: bx + 2, y: groundY });
  out.push({ sprite: solid(1, depth - 3, INK), x: bx + bw - 3, y: groundY });
  out.push({ sprite: solid(bw - 4, 1, INK), x: bx + 2, y: groundY + depth - 4 });
}

/**
 * One room alone, for the focus view: indoor rooms are the cell box with its walls (the sky is not drawn); outdoor rooms
 * stand on the ground with the sky behind. Spots and creatures are relative to the returned model.
 */
export function composeRoom(
  house: HouseView,
  roomId: string,
  options: ComposeOptions & { drawing?: DisplayDrawing } = {},
): SceneModel | null {
  const frame = frameOf(house, options);
  const { content } = frame;
  const built = new Set(house.built);
  const room = houseGrid(content, built).find((r) => r.roomId === roomId);
  if (room === undefined) return null;
  const kind = frame.kinds.get(room.kind);
  if (kind === undefined) return null;
  const view = frame.rooms.get(room.roomId) ?? emptyRoom(room, kind);
  const drawing = options.drawing ?? DEFAULT_DRAWING;
  const w = room.w * CELL_W;
  const back: Placement[] = [];
  const front: Placement[] = [];
  const layers: Layers = { back, front, spots: [], creatures: [], fixtures: [] };
  if (room.outdoor) {
    const groundY = CELL_H;
    const width = w;
    const height = CELL_H + FLOOR_H + 16;
    const sky = skySprite();
    const { width: skyW, height: skyH } = spriteSize(sky);
    const skyTop = groundY - skyH;
    if (skyTop > 0)
      back.push({
        sprite: solid(width, skyTop, sky.palette[sky.rows[0]?.[0] ?? ''] ?? '#6fb2d6'),
        x: 0,
        y: 0,
      });
    for (let sx = 0; sx < width; sx += skyW) {
      const cw = Math.min(skyW, width - sx);
      back.push(
        cw === skyW
          ? { sprite: sky, x: sx, y: Math.max(0, skyTop) }
          : { sprite: sky, x: sx, y: Math.max(0, skyTop), w: cw, h: skyH },
      );
    }
    tileFill(back, shellArt('earth'), 0, groundY + FLOOR_H, width, 16);
    tileFill(back, tilesOf(content, 'lawn', 'ground').tile, 0, groundY, width, FLOOR_H);
    if (kind.floor === 'deck')
      tileFill(back, tilesOf(content, 'deck', 'ground').tile, 0, groundY, w, FLOOR_H);
    if (kind.floor === 'pool-tile') drawPool(content, back, 0, groundY, w);
    drawRoom(frame, layers, room, kind, view, 0, 0, groundY, drawing);
    return finish(
      width,
      height,
      groundY,
      layers,
      [
        {
          roomId,
          kind: room.kind,
          name: kind.name,
          outdoor: true,
          floor: room.floor,
          col: room.col,
          x: 0,
          y: 0,
          w,
          h: height,
        },
      ],
      0,
      0,
    );
  }
  const width = w + WALL_T;
  const ox = 2;
  drawRoom(frame, layers, room, kind, view, ox, 0, 0, drawing);
  // the walls straddle the cell edge: the model's origin is the wall's outer edge
  return finish(
    width,
    CELL_H,
    CELL_H,
    layers,
    [
      {
        roomId,
        kind: room.kind,
        name: kind.name,
        outdoor: false,
        floor: room.floor,
        col: room.col,
        x: 0,
        y: 0,
        w: width,
        h: CELL_H,
      },
    ],
    ox,
    0,
  );
}

function finish(
  width: number,
  height: number,
  groundY: number,
  layers: Layers,
  rooms: SceneRoom[],
  startX: number,
  startY: number,
): SceneModel {
  return {
    width,
    height,
    groundY,
    box: { x: 0, y: 0, w: width, h: height },
    back: layers.back,
    front: layers.front,
    rooms,
    spots: layers.spots,
    creatures: layers.creatures,
    fixtures: layers.fixtures,
    start: { x: startX, y: startY },
  };
}

/**
 * The house with `partId` built on top of it, for the build panel's picture: every placement of both layers in order (the new
 * rooms are empty), the size, at scale 1. Housemates are left out.
 */
export function housePreview(
  house: HouseView,
  partId: string,
  options: { content?: HousingContent; drawing?: DisplayDrawing } = {},
): { placements: Placement[]; width: number; height: number } {
  const model = composeHouse(house, {
    ...(options.content === undefined ? {} : { content: options.content }),
    ...(options.drawing === undefined ? {} : { drawing: options.drawing }),
    creatures: 'skip',
    extraBuilt: [partId],
  });
  return { placements: [...model.back, ...model.front], width: model.width, height: model.height };
}

/** The size of a part's preview: its new rooms plus the roof over them and a few pixels of margin. */
const PREVIEW_MARGIN = { side: 8, top: 56, bottom: 8 };

/**
 * Just the new part, for the build list's rows: the house with `partId` built on top, cropped to the rooms the part adds
 * (its roof and a little margin included), every placement moved so the crop's top left is (0, 0). A part that adds no room
 * shows the whole house. Housemates are left out.
 */
export function partPreview(
  house: HouseView,
  partId: string,
  options: { content?: HousingContent; drawing?: DisplayDrawing } = {},
): { placements: Placement[]; width: number; height: number } {
  const shared = {
    ...(options.content === undefined ? {} : { content: options.content }),
    ...(options.drawing === undefined ? {} : { drawing: options.drawing }),
    creatures: 'skip' as const,
  };
  // A part that waits for others is drawn with them built (their rooms are not what it adds).
  const content = options.content ?? housing;
  const needs: string[] = [];
  const collect = (id: string): void => {
    for (const need of content.parts.find((p) => p.id === id)?.requires ?? []) {
      if (house.built.includes(need) || needs.includes(need)) continue;
      needs.push(need);
      collect(need);
    }
  };
  collect(partId);
  const before = new Set(
    composeHouse(house, { ...shared, extraBuilt: needs }).rooms.map((r) => r.roomId),
  );
  const model = composeHouse(house, { ...shared, extraBuilt: [...needs, partId] });
  const fresh = model.rooms.filter((r) => !before.has(r.roomId));
  const all = [...model.back, ...model.front];
  if (fresh.length === 0) return { placements: all, width: model.width, height: model.height };
  const x0 = Math.max(0, Math.min(...fresh.map((r) => r.x)) - PREVIEW_MARGIN.side);
  const x1 = Math.min(model.width, Math.max(...fresh.map((r) => r.x + r.w)) + PREVIEW_MARGIN.side);
  const y0 = Math.max(0, Math.min(...fresh.map((r) => r.y)) - PREVIEW_MARGIN.top);
  const y1 = Math.min(
    model.height,
    Math.max(...fresh.map((r) => r.y + r.h)) + PREVIEW_MARGIN.bottom,
  );
  return {
    placements: all.map((p) => ({ ...p, x: p.x - x0, y: p.y - y0 })),
    width: x1 - x0,
    height: y1 - y0,
  };
}

/** The scale a phone draws the overview at, and the most a wide window does. */
export const PHONE_SCALE = 2;
export const WIDE_SCALE = 3;

/**
 * The scale of the overview for a box `boxWidth` CSS px wide: the largest whole scale of 1 or more, at most 2 on a phone
 * (under 700 px) and 3 on a wide window, at which a house `houseWidth` scene px wide fits. `fits` says the whole house is on
 * show: it fits by width and (when `houseHeight` and `boxHeight` are given) by height. A house that fits at no scale draws at
 * the phone scale with `fits` false: the scene then centres on the building (`overviewScroll`) and the caller shows the
 * postcard so the player still sees the whole of it.
 */
export function overviewScale(
  boxWidth: number,
  houseWidth: number,
  houseHeight = 0,
  boxHeight = Number.POSITIVE_INFINITY,
): { scale: number; fits: boolean } {
  const cap = boxWidth < 700 ? PHONE_SCALE : WIDE_SCALE;
  for (let scale = cap; scale >= 1; scale--) {
    if (houseWidth * scale <= boxWidth) return { scale, fits: houseHeight * scale <= boxHeight };
  }
  return { scale: PHONE_SCALE, fits: false };
}

/** How much of the earth shows under the grass line when the overview is placed on the ground (scene px). */
export const GROUND_MARGIN = 12;

/**
 * Where the overview's scroll starts for a view `viewWidth` x `viewHeight` CSS px: centred on the building's whole box, and
 * placed down so the grass line sits near the bottom of the view with as much roof above it as fits. A house that fits is
 * not scrolled at all (the clamps give 0).
 */
export function overviewScroll(
  model: Pick<SceneModel, 'box' | 'groundY' | 'width' | 'height'>,
  scale: number,
  viewWidth: number,
  viewHeight: number,
): { left: number; top: number } {
  const clamp = (n: number, max: number): number =>
    Math.min(Math.max(0, Math.round(n)), Math.max(0, max));
  const cx = model.box.x + model.box.w / 2;
  return {
    left: clamp(cx * scale - viewWidth / 2, model.width * scale - viewWidth),
    top: clamp(
      (model.groundY + GROUND_MARGIN) * scale - viewHeight,
      model.height * scale - viewHeight,
    ),
  };
}
