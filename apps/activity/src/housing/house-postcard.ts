/**
 * The postcard (`docs/design/housing.md` 2.4 and 4.4): a small, closed, outside view of a whole house, so a player sees
 * their house (and a friend's) whole on a phone, which the cutaway (112 x 64 px a room) never fits. Pure: no canvas, no DOM.
 *
 * It is built from the same `houseGrid` as the cutaway, at 28 x 16 px a room cell. Every built indoor cell is a piece of
 * facade in the player's wall skin with a shuttered window (the Hearth has the front door, a conservatory is glass); roofs
 * follow the cutaway's rule (one gable per run of columns with the same top floor, low hips on wings, a glass roof over a
 * ground-floor conservatory, the chimney on the core); the cellar is a low stone course with small barred windows; the
 * terrace, garden and pool are small grounds beside the house; everything stands on one ground line over a strip of grass
 * and earth. Colours come from the skins' own palettes (`L M D A B`): the roof's give the roof and the shutters, the walls' give
 * the facade, so thatch reads as thatch and slate as slate. The picture is one sprite on a transparent ground (no sky), so
 * it sits on any backdrop; `placements` has it for `paintPlacements`.
 */
import {
  houseGrid,
  type HouseView,
  type HousingContent,
  type PartDef,
  type RoomPhase,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { expandRows, spriteSize, swapPalette, type SpriteDef } from '../sprites/sprite-data';
import {
  BOARD,
  CHIMNEY,
  DOOR,
  FINIAL,
  FLOWERS,
  FRUIT_SWAP,
  FRUIT_TREE,
  LADDER,
  LANTERN_POST,
  LIT_PANES,
  PARASOL,
  PORCH_LAMP,
  REED,
  SMOKE_FAR,
  SMOKE_NEAR,
  TOWER_WINDOW,
  TREE,
  VENT,
  WINDOW,
} from '../sprites/data/house/postcard';
import { pieceArt, shellArt, skinArt } from './house-art';
import {
  DAY_LIGHTING,
  lightOf,
  moonSprite,
  pixelHash,
  type Lighting,
  type Material,
  type SceneLight,
} from './house-light';
import { drawSky, type Placement } from './house-scene';

/** One room cell on the postcard. */
export const POSTCARD_CELL_W = 28;
export const POSTCARD_CELL_H = 16;
/** Grass left of the leftmost and right of the rightmost thing. */
export const POSTCARD_MARGIN = 4;
/** Rows of grass and of earth under the ground line. */
const GRASS_ROWS = 4;
const EARTH_ROWS = 3;
/** How far a roof overhangs the walls under it. */
const OVER = 2;
/** The eave: the three rows at the bottom of a roof (light, shade, ink). */
const EAVE = 3;
/** Rows above the roof or the chimney's smoke. */
const TOP_MARGIN = 1;
/** The cellar's stone course at the foot of the walls. */
const CELLAR_H = 5;

/** A postcard narrower than this has no moon at night. */
const MOON_MIN_WIDTH = 100;

const INK = '#0d0a1a';
const WOOD = '#85603f';

/** What `composePostcard` reads: a house view, or just its built parts and skins. */
export type PostcardHouse =
  HouseView | { parts: readonly string[]; roof: string; walls: string; owner?: undefined };

/** A box on the postcard (a room's cell or a grounds part's strip): in picture pixels. */
export interface PostcardBox {
  kind: 'room' | 'grounds' | 'cellar';
  roomId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PostcardModel {
  width: number;
  height: number;
  /** The row of the first grass pixel: every floor 0 wall ends on the row above. */
  groundY: number;
  /** The picture, flattened: one sprite on a transparent ground (the house and its grounds; no sky). */
  sprite: SpriteDef;
  /**
   * The same picture as placements for `paintPlacements`, one sprite per material (all at 0,0, never overlapping), tagged for
   * the lighting pass; with the phase's sky (twilight, night) behind them. By day it paints exactly `sprite`.
   */
  placements: Placement[];
  /** What the picture is lit by: the phase and the glow of its lit windows, porch lamp and lantern post (none by day). */
  lighting: Lighting;
  /** The phase the model was composed for. */
  phase: RoomPhase;
  /** The rooms' cells (indoor floors 0 and up), the cellar's strip and the grounds' strips. They never overlap. */
  boxes: PostcardBox[];
  /** Pixels a drawing call tried to set outside the picture (always 0; the tests check). */
  clipped: number;
}

// ---------------------------------------------------------------------------------------------
// A pixel grid

// More than sixty colours once a house has its orchard, pond and tower: the keys go on through the punctuation.
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+=?@^_~;:<>-';

class Raster {
  clipped = 0;
  /** What the pixels set from now on are made of (the lighting pass maps them by it). */
  mat: Material = 'auto';
  private readonly cells: (string | null)[];
  private readonly mats: Material[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = Array.from({ length: w * h }, () => null);
    this.mats = Array.from({ length: w * h }, () => 'auto');
  }
  set(x: number, y: number, colour: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      this.clipped++;
      return;
    }
    this.cells[y * this.w + x] = colour;
    this.mats[y * this.w + x] = this.mat;
  }
  get(x: number, y: number): string | null {
    return this.cells[y * this.w + x] ?? null;
  }
  rect(x: number, y: number, w: number, h: number, colour: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, colour);
  }
  /** Stamps a sprite with its top left at (x, y); clear pixels stay as they were. */
  blit(sprite: SpriteDef, x: number, y: number): void {
    const look = sampler(sprite);
    const { width, height } = spriteSize(sprite);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const c = look(i, j);
        if (c !== null) this.set(x + i, y + j, c);
      }
    }
  }
  /** The picture as a sprite; `only` keeps the pixels of one material. */
  sprite(only?: Material): SpriteDef {
    const palette: Record<string, string> = {};
    const chars = new Map<string, string>();
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) {
        const colour = this.cells[y * this.w + x];
        if (
          colour === null ||
          colour === undefined ||
          (only !== undefined && this.mats[y * this.w + x] !== only)
        ) {
          row += '.';
          continue;
        }
        let ch = chars.get(colour);
        if (ch === undefined) {
          ch = CHARS[chars.size];
          if (ch === undefined) throw new Error('The postcard uses more colours than it has keys.');
          chars.set(colour, ch);
          palette[ch] = colour;
        }
        row += ch;
      }
      rows.push(row);
    }
    return { rows, palette };
  }
  /** One sprite for each material that has pixels, in the order they first appear. */
  layers(): { mat: Material; sprite: SpriteDef }[] {
    const present = [...new Set(this.mats.filter((_m, i) => this.cells[i] != null))];
    return present.map((mat) => ({ mat, sprite: this.sprite(mat) }));
  }
}

/** A sprite as a function of the pixel: its colour, or null where it is clear. Wraps both ways (tiles repeat). */
function sampler(sprite: SpriteDef): (x: number, y: number) => string | null {
  const rows = expandRows(sprite);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return (x, y) => {
    if (width === 0 || height === 0) return null;
    const ch = rows[((y % height) + height) % height]?.[((x % width) + width) % width] ?? '.';
    return ch === '.' ? null : (sprite.palette[ch] ?? null);
  };
}

/** The five keys of a skin's palette, with a grey for any a stand-in tile lacks. */
interface SkinColours {
  L: string;
  M: string;
  D: string;
  A: string;
  B: string;
}

function coloursOf(sprite: SpriteDef): SkinColours {
  const grey = Object.values(sprite.palette)[0] ?? '#8d889a';
  const p = sprite.palette;
  return {
    L: p['L'] ?? p['l'] ?? grey,
    M: p['M'] ?? p['g'] ?? grey,
    D: p['D'] ?? p['M'] ?? p['g'] ?? grey,
    A: p['A'] ?? p['D'] ?? grey,
    B: p['B'] ?? p['L'] ?? grey,
  };
}

// ---------------------------------------------------------------------------------------------
// Roofs

interface Run {
  from: number;
  to: number;
  top: number;
  wing: boolean;
  /** The tower: a spire. */
  tower: boolean;
  glass: boolean;
}

type RoofKind = 'gable' | 'hip' | 'spire';

/** The runs of columns that share a top floor and a kind of part, left to right (the cutaway's rule). */
function runsOf(
  rooms: readonly {
    col: number;
    w: number;
    floor: number;
    kind: string;
    part: string;
    outdoor: boolean;
  }[],
  parts: ReadonlyMap<string, PartDef>,
): Run[] {
  const tops = new Map<number, { top: number; wing: boolean; tower: boolean; glass: boolean }>();
  for (const room of rooms) {
    if (room.outdoor || room.floor < 0) continue;
    const wing = parts.get(room.part)?.kind === 'wing';
    const tower = parts.get(room.part)?.kind === 'tower';
    for (let c = room.col; c < room.col + room.w; c++) {
      const at = tops.get(c);
      if (at === undefined || room.floor > at.top) {
        tops.set(c, { top: room.floor, wing, tower, glass: room.kind === 'conservatory' });
      }
    }
  }
  const runs: Run[] = [];
  for (const col of [...tops.keys()].sort((a, b) => a - b)) {
    const at = tops.get(col);
    if (at === undefined) continue;
    const last = runs[runs.length - 1];
    if (
      last !== undefined &&
      last.to === col - 1 &&
      last.top === at.top &&
      last.wing === at.wing &&
      last.tower === at.tower
    ) {
      last.to = col;
      last.glass = last.glass && at.glass;
    } else {
      runs.push({
        from: col,
        to: col,
        top: at.top,
        wing: at.wing,
        tower: at.tower,
        glass: at.glass,
      });
    }
  }
  return runs;
}

/** Rows of slope under the ridge: a gable rises with its width (two pixels in for every row up), a hip is low. */
export function postcardSlope(base: number, kind: RoofKind): number {
  if (kind === 'hip') return 3;
  // a spire gives up one pixel a side for every row: a tower's roof is steeper than a gable
  if (kind === 'spire') return Math.floor((base - 4) / 2);
  return Math.min(12, Math.max(4, Math.floor((base - 10) / 4)));
}

/** The width of a roof over `cells` cells: the walls and an overhang each side. */
export function postcardRoofBase(cells: number): number {
  return cells * POSTCARD_CELL_W + 2 * OVER;
}

const GLASS = { L: '#d8f4ff', M: '#9fd8ee', D: '#6fb2d6', B: '#ffffff' };

/**
 * One roof with its top left at (x, top): ink along the ridge and the slopes (two pixels a row, so a one pixel line down a 2:1
 * slope), the skin's ridge cap, its tile, then the eave (light, shade, ink). A glass roof is panes with white bars.
 */
function drawRoof(
  r: Raster,
  x: number,
  top: number,
  base: number,
  kind: RoofKind,
  skin: { tile: SpriteDef; ridge?: SpriteDef; eave?: SpriteDef },
  glass: boolean,
): number {
  const n = postcardSlope(base, kind);
  const step = kind === 'spire' ? 1 : 2;
  r.mat = glass ? 'auto' : 'roof';
  const tile = sampler(skin.tile);
  const ridge = skin.ridge === undefined ? null : sampler(skin.ridge);
  const eave = skin.eave === undefined ? null : sampler(skin.eave);
  const pal = coloursOf(skin.tile);
  for (let i = 0; i < n; i++) {
    const inset = step * (n - i);
    for (let px = inset; px < base - inset; px++) {
      const atEdge = px < inset + step || px >= base - inset - step;
      let colour: string;
      if (i === 0 || atEdge) colour = INK;
      else if (glass) colour = px % 8 === 0 ? GLASS.B : (px + i) % 7 === 0 ? GLASS.L : GLASS.M;
      else if (i === 1) colour = ridge?.(px, 1) ?? pal.L;
      else colour = tile(px - inset, i) ?? pal.M;
      r.set(x + px, top + i, colour);
    }
  }
  for (let e = 0; e < EAVE; e++) {
    for (let px = 0; px < base; px++) {
      let colour: string;
      if (px === 0 || px === base - 1 || e === EAVE - 1) colour = INK;
      else if (glass) colour = px % 8 === 0 ? GLASS.B : e === 0 ? GLASS.M : GLASS.D;
      else if (e === 0) colour = eave?.(px, 1) ?? pal.M;
      else colour = eave?.(px, 2) ?? pal.D;
      r.set(x + px, top + n + e, colour);
    }
  }
  return n + EAVE;
}

// ---------------------------------------------------------------------------------------------
// Parts of the picture

interface Unit {
  floor: number;
  col: number;
  kind: string;
  part: string;
  roomId: string;
}

/** The glass wall of a conservatory cell: panes with white bars and a plant behind one. */
function drawGlassCell(r: Raster, x: number, y: number): void {
  r.mat = 'auto';
  for (let j = 0; j < POSTCARD_CELL_H; j++) {
    for (let i = 0; i < POSTCARD_CELL_W; i++) {
      let colour: string = GLASS.M;
      if (i % 7 === 0 || j === 0 || j === 7) colour = GLASS.B;
      else if ((i + j) % 9 === 0) colour = GLASS.L;
      else if (j > 12) colour = GLASS.D;
      r.set(x + i, y + j, colour);
    }
  }
  // a leafy plant behind the glass
  const leaf = '#5a9a58';
  const dark = '#467a4c';
  for (const [dx, dy] of [
    [11, 7],
    [12, 6],
    [13, 7],
    [12, 8],
    [10, 9],
    [14, 9],
    [11, 10],
    [13, 10],
    [12, 11],
    [12, 12],
    [12, 13],
    [11, 8],
    [13, 8],
  ] as const) {
    r.set(x + dx + 2, y + dy, dy > 9 ? dark : leaf);
  }
  r.rect(x + 12, y + 14, 5, 2, '#b45c42');
}

/** A cellar's course: low fieldstone along the foot of the walls under an ink line, a barred window in each cell. */
function drawCellar(r: Raster, x: number, y: number, cells: number): void {
  const stone = coloursOf(skinArt('fieldstone', 'walls').tile);
  const look = sampler(skinArt('fieldstone', 'walls').tile);
  const w = cells * POSTCARD_CELL_W;
  r.mat = 'exterior';
  for (let j = 0; j < CELLAR_H; j++) {
    for (let i = 0; i < w; i++) {
      r.set(x + i, y + j, j === 0 ? INK : j === 1 ? stone.L : (look(i, j + 1) ?? stone.M));
    }
  }
  r.mat = 'auto';
  for (let c = 0; c < cells; c++) r.blit(VENT, x + c * POSTCARD_CELL_W + 19, y + 1);
}

// ---------------------------------------------------------------------------------------------
// The composition

/** The sprite colours of the roof's mid and shade and the wall's light and shade, for the windows. */
function windowFor(roof: SkinColours, walls: SkinColours): SpriteDef {
  return swapPalette(WINDOW, { S: roof.M, T: roof.D, L: walls.L, D: walls.D });
}

/**
 * Which windows are lit at twilight or night. A house view says it by its rooms: a room's window is lit when the room holds a
 * light (a lamp, the hearth, anything the art flags: `lightOf`) or a housemate who is home; the Hearth always has its fire. A bare
 * list of parts (a row of the visit list) knows no rooms, so a stable pattern lights about three windows in five (two in five at
 * twilight) and the Hearth's door always has its lamp. Never random: the same house looks the same on every screen.
 */
function litRooms(
  house: PostcardHouse,
  content: HousingContent,
): { lit(roomId: string, floor: number, col: number): boolean; post: boolean } {
  if (!('rooms' in house)) {
    const garden = 'parts' in house && house.parts.includes('garden');
    return {
      lit: (_roomId, floor, col) => pixelHash(col * 13 + 7, floor * 17 + 3) % 5 < 3,
      post: garden,
    };
  }
  const forms = new Map(content.pieces.map((p) => [p.id, p.form]));
  const lit = new Set<string>();
  let post = false;
  for (const view of house.rooms) {
    for (const pieceId of Object.values(view.spots)) {
      if (pieceId === null) continue;
      const kind = lightOf(pieceArt(pieceId, content), forms.get(pieceId))?.kind;
      if (kind === undefined) continue;
      if (kind === 'lantern') post = true;
      else lit.add(view.id);
    }
    if (view.kind === 'hearth') lit.add(view.id);
  }
  for (const mate of house.housemates) if (mate.home) lit.add(mate.roomId);
  return { lit: (roomId) => lit.has(roomId), post };
}

/**
 * Composes the postcard of a house (a `HouseView`, or `{ parts, roof, walls }`) in a phase (default day, which is exactly the
 * picture on a transparent ground). At twilight and night it is the same pixels tagged by material for the lighting pass
 * (`house-light.ts`: dark walls and roof, the lawn, the pool and the earth in night tones), with the valley's sky behind it, windows
 * lit warm, a porch lamp by the door and a lantern post in the garden, and `lighting` says where their glow falls.
 */
export function composePostcard(
  house: PostcardHouse,
  content: HousingContent = housing,
  phase: RoomPhase = 'day',
): PostcardModel {
  const built = new Set('built' in house ? house.built : house.parts);
  const roofId = 'exterior' in house ? house.exterior.roof : house.roof;
  const wallsId = 'exterior' in house ? house.exterior.walls : house.walls;
  const grid = houseGrid(content, built);
  const partDefs = new Map(content.parts.map((p) => [p.id, p]));
  const indoor = grid.filter((g) => !g.outdoor && g.floor >= 0);
  const units: Unit[] = indoor.flatMap((g) =>
    Array.from({ length: g.w }, (_, k) => ({
      floor: g.floor,
      col: g.col + k,
      kind: g.kind,
      part: g.part,
      roomId: g.roomId,
    })),
  );
  const at = new Map(units.map((u) => [`${String(u.floor)}:${String(u.col)}`, u]));
  const unitAt = (floor: number, col: number): Unit | undefined =>
    at.get(`${String(floor)}:${String(col)}`);

  const minCol = Math.min(0, ...grid.map((g) => g.col));
  const maxCol = Math.max(1, ...grid.map((g) => g.col + g.w));
  const width = (maxCol - minCol) * POSTCARD_CELL_W + 2 * POSTCARD_MARGIN;
  const originX = POSTCARD_MARGIN - minCol * POSTCARD_CELL_W;

  const roofSkin = skinArt(roofId, 'roof');
  const wallSkin = skinArt(wallsId, 'walls');
  const roofPal = coloursOf(roofSkin.tile);
  const wallPal = coloursOf(wallSkin.tile);
  const wallLook = sampler(wallSkin.tile);

  const runs = runsOf(grid, partDefs);
  const roofs = runs.map((run) => {
    const cells = run.to - run.from + 1;
    const kind: RoofKind = run.wing ? 'hip' : run.tower ? 'spire' : 'gable';
    const base = postcardRoofBase(cells);
    return { run, base, kind, height: postcardSlope(base, kind) + EAVE };
  });
  const finialH = spriteSize(FINIAL).height;
  let above = 0;
  for (const roof of roofs)
    above = Math.max(
      above,
      (roof.run.top + 1) * POSTCARD_CELL_H +
        roof.height +
        (roof.kind === 'spire' ? finialH - 1 : 0),
    );

  // The chimney stands on the core's roof, on the left slope, its foot sunk into the roof.
  const chimneyRoof = roofs.find((q) => q.run.from <= 0 && q.run.to >= 0 && !q.run.wing);
  let chimney: { x: number; y: number } | null = null;
  let chimneyAbove = 0;
  if (chimneyRoof !== undefined) {
    const roofX = originX + chimneyRoof.run.from * POSTCARD_CELL_W - OVER;
    const n = postcardSlope(chimneyRoof.base, chimneyRoof.kind);
    const relX = Math.floor(chimneyRoof.base * 0.27);
    // the first row of the roof whose slope clears the chimney's left foot
    let row = 0;
    while (row < n - 1 && 2 * (n - row) + 2 > relX + 1) row++;
    const sunk = 2;
    const roofBottomRel = (chimneyRoof.run.top + 1) * POSTCARD_CELL_H + chimneyRoof.height;
    const footRel = roofBottomRel - row - sunk; // height above the ground of the chimney's lowest row
    const chimneyH = spriteSize(CHIMNEY).height;
    chimneyAbove = footRel + chimneyH + 8;
    chimney = { x: roofX + relX, y: footRel };
  }
  const topExtent = Math.max(above, chimneyAbove);
  const groundY = TOP_MARGIN + topExtent;
  const height = groundY + GRASS_ROWS + EARTH_ROWS;
  const r = new Raster(width, height);
  const boxes: PostcardBox[] = [];

  // grass and earth over the whole width, the lawn's top row bright
  const lawn = sampler(skinArt('lawn', 'ground').tile);
  const earth = sampler(shellArt('earth'));
  const lawnPal = coloursOf(skinArt('lawn', 'ground').tile);
  for (let x = 0; x < width; x++) {
    r.mat = 'ground';
    for (let j = 0; j < GRASS_ROWS; j++) r.set(x, groundY + j, lawn(x, j) ?? lawnPal.M);
    r.mat = 'earth';
    for (let j = 0; j < EARTH_ROWS; j++) r.set(x, groundY + GRASS_ROWS + j, earth(x, j) ?? WOOD);
  }

  // chimney and its smoke, before the roofs so the roof covers the foot
  if (chimney !== null) {
    const cy = groundY - chimney.y - spriteSize(CHIMNEY).height;
    r.mat = 'exterior';
    r.blit(CHIMNEY, chimney.x, cy);
    r.mat = 'auto';
    r.blit(SMOKE_NEAR, chimney.x + 2, cy - 4);
    r.blit(SMOKE_FAR, chimney.x + 5, cy - 7);
  }

  // roofs, lowest first: a taller wall then hides the overhang of a lower roof beside it
  for (const roof of [...roofs].sort((a, b) => a.run.top - b.run.top)) {
    const x = originX + roof.run.from * POSTCARD_CELL_W - OVER;
    const y = groundY - (roof.run.top + 1) * POSTCARD_CELL_H - roof.height;
    drawRoof(r, x, y, roof.base, roof.kind, roofSkin, roof.run.glass && roof.run.top === 0);
    if (roof.kind === 'spire') {
      // the pennant on the tip, its foot in the point
      r.mat = 'auto';
      r.blit(FINIAL, x + Math.floor((roof.base - spriteSize(FINIAL).width) / 2), y - finialH + 1);
    }
  }

  // facades
  const window = windowFor(roofPal, wallPal);
  for (const u of [...units].sort((a, b) => a.floor - b.floor || a.col - b.col)) {
    const x = originX + u.col * POSTCARD_CELL_W;
    const y = groundY - (u.floor + 1) * POSTCARD_CELL_H;
    if (u.kind === 'conservatory') drawGlassCell(r, x, y);
    else {
      r.mat = 'wall';
      for (let j = 0; j < POSTCARD_CELL_H; j++)
        for (let i = 0; i < POSTCARD_CELL_W; i++)
          r.set(x + i, y + j, j === 0 ? wallPal.D : (wallLook(x + i, y + j) ?? wallPal.M));
    }
    // the silhouette: ink where there is no wall beside it, a shade line between two parts
    const left = unitAt(u.floor, u.col - 1);
    const right = unitAt(u.floor, u.col + 1);
    r.mat = u.kind === 'conservatory' ? 'auto' : 'wall';
    for (let j = 0; j < POSTCARD_CELL_H; j++) {
      if (left === undefined) r.set(x, y + j, INK);
      else if (left.part !== u.part) r.set(x, y + j, wallPal.A);
      if (right === undefined) r.set(x + POSTCARD_CELL_W - 1, y + j, INK);
    }
    boxes.push({
      kind: 'room',
      roomId: u.roomId,
      x,
      y,
      w: POSTCARD_CELL_W,
      h: POSTCARD_CELL_H,
    });
  }

  // the cellar: a stone course at the foot of its columns
  for (const g of grid.filter((q) => q.floor < 0)) {
    const x = originX + g.col * POSTCARD_CELL_W;
    drawCellar(r, x, groundY - CELLAR_H, g.w);
    boxes.push({
      kind: 'cellar',
      roomId: g.roomId,
      x,
      y: groundY - CELLAR_H,
      w: g.w * POSTCARD_CELL_W,
      h: CELLAR_H,
    });
  }

  // windows, and the door on the Hearth; from twilight on a lit window is warm and glows on the wall round it
  const dark = phase !== 'day';
  const lit = litRooms(house, content);
  const litWindow = swapPalette(window, LIT_PANES);
  const round = swapPalette(TOWER_WINDOW, {
    S: roofPal.M,
    T: roofPal.D,
    L: wallPal.L,
    D: wallPal.D,
  });
  const litRound = swapPalette(round, LIT_PANES);
  const lights: SceneLight[] = [];
  for (const u of units) {
    if (u.kind === 'conservatory') continue;
    const x = originX + u.col * POSTCARD_CELL_W;
    const y = groundY - (u.floor + 1) * POSTCARD_CELL_H;
    const cell = { x, y, w: POSTCARD_CELL_W, h: POSTCARD_CELL_H };
    if (u.kind === 'hearth') {
      r.mat = 'auto';
      r.blit(DOOR, x + 10, y + POSTCARD_CELL_H - spriteSize(DOOR).height);
      if (dark) {
        // the porch lamp by the door: always on from dusk
        r.mat = 'light';
        r.blit(PORCH_LAMP, x + 20, y + 5);
        lights.push({ kind: 'porch', x: x + 21, y: y + 6, clip: cell, size: 0.5 });
      }
    } else if (
      dark &&
      lit.lit(u.roomId, u.floor, u.col) &&
      // at twilight most of the rooms that will be lit have lit up already
      (phase === 'night' || pixelHash(u.col, u.floor) % 5 < 4)
    ) {
      r.mat = 'light';
      if (u.part === 'tower') r.blit(litRound, x + 10, y + 3);
      else r.blit(litWindow, x + 8, y + 3);
      lights.push({ kind: 'window', x: x + 14, y: y + 7, clip: cell, size: 0.85 });
    } else {
      r.mat = 'window';
      if (u.part === 'tower') r.blit(round, x + 10, y + 3);
      else r.blit(window, x + 8, y + 3);
    }
  }

  // grounds
  const orchardSkin =
    'rooms' in house ? house.rooms.find((v) => v.kind === 'orchard')?.floor : undefined;
  for (const g of grid.filter((q) => q.outdoor)) {
    const x = originX + g.col * POSTCARD_CELL_W;
    const w = g.w * POSTCARD_CELL_W;
    if (g.floor > 0) {
      // a balcony hangs on the wall at its floor
      const bottom = groundY - g.floor * POSTCARD_CELL_H;
      drawBalcony(r, x, bottom, w);
      boxes.push({ kind: 'grounds', roomId: g.roomId, x, y: bottom - 12, w, h: 12 });
      if (dark && lit.post) {
        r.mat = 'light';
        r.blit(PORCH_LAMP, x + w - 8, bottom - 8);
        lights.push({
          kind: 'lantern',
          x: x + w - 7,
          y: bottom - 7,
          size: 0.3,
          clip: { x: x - 6, y: bottom - 20, w: w + 12, h: 22 },
        });
      }
      continue;
    }
    drawGrounds(r, g.kind, x, groundY, w, orchardSkin);
    boxes.push({ kind: 'grounds', roomId: g.roomId, x, y: groundY - 12, w, h: 12 + GRASS_ROWS });
    if (dark && g.kind === 'garden' && lit.post) {
      // the lantern post on the lawn between the hedge and the tree
      const px = x + 38;
      const py = groundY - spriteSize(LANTERN_POST).height + 1;
      r.mat = 'light';
      r.blit(LANTERN_POST, px, py);
      lights.push({
        kind: 'lantern',
        x: px + 2,
        y: py + 2,
        size: 0.45,
        clip: { x: 0, y: 0, w: width, h: groundY + GRASS_ROWS },
      });
    }
  }

  const sprite = r.sprite();
  const placements: Placement[] = [];
  if (dark) {
    drawSky(placements, width, groundY, phase, undefined, true);
    // a small picture (the hut) has no room for the moon: it would sit on the chimney
    if (width < MOON_MIN_WIDTH) {
      const moon = moonSprite();
      for (let i = placements.length - 1; i >= 0; i--)
        if (placements[i]?.sprite === moon) placements.splice(i, 1);
    }
  }
  for (const layer of r.layers())
    placements.push({ sprite: layer.sprite, x: 0, y: 0, mat: layer.mat });
  return {
    width,
    height,
    groundY,
    sprite,
    placements,
    lighting: dark ? { phase, lights } : DAY_LIGHTING,
    phase,
    boxes,
    clipped: r.clipped,
  };
}

/** A terrace, a garden or a pool: `w` px wide from `x`, on the ground line `groundY`. */
function drawGrounds(
  r: Raster,
  kind: string,
  x: number,
  groundY: number,
  w: number,
  orchardSkin?: string,
): void {
  if (kind === 'orchard') {
    const fruit = (orchardSkin ?? 'orchard-apple').replace('orchard-', '');
    const tree = swapPalette(FRUIT_TREE, FRUIT_SWAP[fruit] ?? {});
    const th = spriteSize(tree).height;
    r.mat = 'ground';
    for (let i = 0; i < w; i++) if (i % 5 === 2) r.set(x + i, groundY, '#9ccc6c');
    // foliage: the lighting pass takes it through the lawn's ramp, so the trees go dark with the grass
    r.mat = 'ground';
    for (const dx of [3, 22, 41]) r.blit(tree, x + dx, groundY - th + 1);
    return;
  }
  if (kind === 'pond') {
    const water = coloursOf(skinArt('pond-water', 'ground').tile);
    // the pond: a bank and water sunk under the ground line, a small arched bridge over it, reeds at both banks
    for (let j = 1; j <= 4; j++) {
      const inset = j === 4 ? 6 : j === 3 ? 5 : 4;
      r.mat = 'earth';
      r.set(x + inset - 1, groundY + j, INK);
      r.set(x + w - inset, groundY + j, INK);
      r.mat = 'water';
      for (let i = inset; i < w - inset; i++) {
        let colour = water.M;
        if (j === 1 && i % 7 < 2) colour = water.L;
        else if (j === 4) colour = water.D;
        r.set(x + i, groundY + j, colour);
      }
    }
    r.mat = 'earth';
    for (let i = 5; i < w - 5; i++) r.set(x + i, groundY + 5, INK);
    r.mat = 'auto';
    for (let i = 0; i < 40; i++) {
      const t = (i - 19.5) / 20;
      const lift = Math.round(5 * (1 - t * t));
      const bx = x + 8 + i;
      r.set(bx, groundY - lift - 3, INK);
      r.set(bx, groundY - lift - 2, i % 8 === 3 ? '#915d42' : '#e4b27a');
      r.set(bx, groundY - lift - 1, '#bc8050');
      r.set(bx, groundY - lift, INK);
      if (i % 9 === 1) r.set(bx, groundY - lift - 4, '#915d42');
    }
    r.blit(REED, x + 2, groundY - 6);
    r.blit(REED, x + w - 4, groundY - 6);
    return;
  }
  if (kind === 'terrace') {
    const deck = coloursOf(skinArt('deck', 'ground').tile);
    r.mat = 'floor';
    // the deck: three rows raised over the grass, planks
    for (let i = 0; i < w; i++) {
      r.set(x + i, groundY - 2, deck.L);
      r.set(x + i, groundY - 1, i % 7 === 6 ? deck.D : deck.M);
      r.set(x + i, groundY, deck.D);
    }
    // the rail: posts every seven px and two rails
    for (let i = 1; i < w - 1; i += 7) r.rect(x + i, groundY - 8, 1, 6, deck.A);
    r.rect(x + 1, groundY - 8, w - 2, 1, deck.L);
    r.rect(x + 1, groundY - 5, w - 2, 1, deck.D);
    r.mat = 'auto';
    r.blit(PARASOL, x + Math.floor(w / 2) - 5, groundY - 11);
    return;
  }
  if (kind === 'garden') {
    const green = { L: '#9ccc6c', M: '#5a9a58', D: '#467a4c' };
    // a hedge with a scalloped top and a light edge
    const hx = x + 3;
    const hw = 33;
    r.mat = 'ground';
    for (let i = 0; i < hw; i++) {
      const top = groundY - 6 + (i % 6 < 3 ? 0 : 1);
      for (let j = top; j < groundY; j++) {
        const edge = j === top || i === 0 || i === hw - 1;
        r.set(
          hx + i,
          j,
          edge ? INK : (i + j) % 5 === 0 ? green.L : j === top + 1 ? green.M : green.D,
        );
      }
    }
    r.mat = 'auto';
    r.blit(TREE, x + w - 15, groundY - 9);
    // flowers in the grass in front
    FLOWERS.forEach((flower, k) => r.blit(flower, x + 6 + k * 8, groundY - 1));
    return;
  }
  if (kind === 'pool') {
    const tile = coloursOf(skinArt('pool-tile', 'ground').tile);
    const water = coloursOf(skinArt('pool-water', 'ground').tile);
    // the coping along the ground line and the basin sunk under it
    r.mat = 'exterior';
    for (let i = 2; i < w - 2; i++) r.set(x + i, groundY, i % 4 === 3 ? tile.D : tile.L);
    for (let j = 1; j <= 4; j++) {
      r.mat = 'exterior';
      r.set(x + 3, groundY + j, INK);
      r.set(x + w - 4, groundY + j, INK);
      r.mat = 'water';
      for (let i = 4; i < w - 4; i++) {
        let colour = water.M;
        if (j === 1 && (i % 9 === 2 || i % 9 === 3)) colour = water.L;
        else if (j === 4) colour = water.D;
        else if (j === 3 && i % 11 === 5) colour = water.D;
        r.set(x + i, groundY + j, colour);
      }
    }
    r.mat = 'exterior';
    for (let i = 3; i < w - 3; i++) r.set(x + i, groundY + 5, INK);
    r.mat = 'auto';
    r.blit(LADDER, x + 7, groundY - 5);
    r.blit(BOARD, x + w - 16, groundY - 4);
  }
}

/** A balcony: `w` px wide, its deck on the bottom row `bottom - 1`: three rows of planks and a rail with posts. */
function drawBalcony(r: Raster, x: number, bottom: number, w: number): void {
  const deck = coloursOf(skinArt('deck', 'ground').tile);
  r.mat = 'floor';
  for (let i = 0; i < w; i++) {
    r.set(x + i, bottom - 3, deck.L);
    r.set(x + i, bottom - 2, i % 7 === 6 ? deck.D : deck.M);
    r.set(x + i, bottom - 1, INK);
  }
  for (let i = 1; i < w - 1; i += 6) r.rect(x + i, bottom - 8, 1, 5, deck.A);
  r.rect(x + 1, bottom - 8, w - 2, 1, deck.L);
  // a pot of flowers on the deck
  r.mat = 'auto';
  r.rect(x + 13, bottom - 6, 3, 3, '#b45c42');
  r.set(x + 14, bottom - 7, '#ff8fab');
  r.set(x + 13, bottom - 8, '#5a9a58');
}

// ---------------------------------------------------------------------------------------------
// The spoken name

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * What a screen reader says: "Anna's house: cottage with an east wing and a pool". The core is the biggest of the core parts
 * built; the rest follow in build order, named by the parts' own names. `owner` is the name in the lead-in (default "house").
 */
export function postcardName(
  house: PostcardHouse,
  owner?: string,
  content: HousingContent = housing,
): string {
  const built = new Set('built' in house ? house.built : house.parts);
  const parts = content.parts.filter((p) => built.has(p.id)).sort((a, b) => a.order - b.order);
  const core = parts.filter((p) => p.kind === 'core').at(-1);
  const extras = parts
    .filter((p) => p.kind !== 'core')
    .map((p) => {
      const name = p.name.toLowerCase();
      return `${article(name)} ${name}`;
    });
  const who =
    owner ?? ('owner' in house && house.owner !== undefined ? house.owner.name : undefined);
  const lead = who === undefined ? 'House' : `${who}'s house`;
  const main = core === undefined ? 'empty plot' : core.name.toLowerCase();
  if (extras.length === 0) return `${lead}: ${main}`;
  const list =
    extras.length === 1
      ? (extras[0] ?? '')
      : `${extras.slice(0, -1).join(', ')} and ${extras.at(-1) ?? ''}`;
  return `${lead}: ${main} with ${list}`;
}
