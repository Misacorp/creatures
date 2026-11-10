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
import { houseGrid, type HouseView, type HousingContent, type PartDef } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { expandRows, spriteSize, swapPalette, type SpriteDef } from '../sprites/sprite-data';
import {
  BOARD,
  CHIMNEY,
  DOOR,
  FLOWERS,
  LADDER,
  PARASOL,
  SMOKE_FAR,
  SMOKE_NEAR,
  TREE,
  VENT,
  WINDOW,
} from '../sprites/data/house/postcard';
import { shellArt, skinArt } from './house-art';
import type { Placement } from './house-scene';

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
  /** The picture: one sprite on a transparent ground. */
  sprite: SpriteDef;
  /** The same as placements for `paintPlacements` (one, at 0,0). */
  placements: Placement[];
  /** The rooms' cells (indoor floors 0 and up), the cellar's strip and the grounds' strips. They never overlap. */
  boxes: PostcardBox[];
  /** Pixels a drawing call tried to set outside the picture (always 0; the tests check). */
  clipped: number;
}

// ---------------------------------------------------------------------------------------------
// A pixel grid

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

class Raster {
  clipped = 0;
  private readonly cells: (string | null)[];
  private readonly chars = new Map<string, string>();
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = Array.from({ length: w * h }, () => null);
  }
  set(x: number, y: number, colour: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      this.clipped++;
      return;
    }
    this.cells[y * this.w + x] = colour;
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
  sprite(): SpriteDef {
    const palette: Record<string, string> = {};
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) {
        const colour = this.cells[y * this.w + x];
        if (colour === null || colour === undefined) {
          row += '.';
          continue;
        }
        let ch = this.chars.get(colour);
        if (ch === undefined) {
          ch = CHARS[this.chars.size];
          if (ch === undefined) throw new Error('The postcard uses more colours than it has keys.');
          this.chars.set(colour, ch);
          palette[ch] = colour;
        }
        row += ch;
      }
      rows.push(row);
    }
    return { rows, palette };
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
  glass: boolean;
}

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
  const tops = new Map<number, { top: number; wing: boolean; glass: boolean }>();
  for (const room of rooms) {
    if (room.outdoor || room.floor < 0) continue;
    const wing = parts.get(room.part)?.kind === 'wing';
    for (let c = room.col; c < room.col + room.w; c++) {
      const at = tops.get(c);
      if (at === undefined || room.floor > at.top) {
        tops.set(c, { top: room.floor, wing, glass: room.kind === 'conservatory' });
      }
    }
  }
  const runs: Run[] = [];
  for (const col of [...tops.keys()].sort((a, b) => a - b)) {
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

/** Rows of slope under the ridge: a gable rises with its width (two pixels in for every row up), a hip is low. */
export function postcardSlope(base: number, kind: 'gable' | 'hip'): number {
  if (kind === 'hip') return 3;
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
  kind: 'gable' | 'hip',
  skin: { tile: SpriteDef; ridge?: SpriteDef; eave?: SpriteDef },
  glass: boolean,
): number {
  const n = postcardSlope(base, kind);
  const tile = sampler(skin.tile);
  const ridge = skin.ridge === undefined ? null : sampler(skin.ridge);
  const eave = skin.eave === undefined ? null : sampler(skin.eave);
  const pal = coloursOf(skin.tile);
  for (let i = 0; i < n; i++) {
    const inset = 2 * (n - i);
    for (let px = inset; px < base - inset; px++) {
      const atEdge = px < inset + 2 || px >= base - inset - 2;
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
  for (let j = 0; j < CELLAR_H; j++) {
    for (let i = 0; i < w; i++) {
      r.set(x + i, y + j, j === 0 ? INK : j === 1 ? stone.L : (look(i, j + 1) ?? stone.M));
    }
  }
  for (let c = 0; c < cells; c++) r.blit(VENT, x + c * POSTCARD_CELL_W + 19, y + 1);
}

// ---------------------------------------------------------------------------------------------
// The composition

/** The sprite colours of the roof's mid and shade and the wall's light and shade, for the windows. */
function windowFor(roof: SkinColours, walls: SkinColours): SpriteDef {
  return swapPalette(WINDOW, { S: roof.M, T: roof.D, L: walls.L, D: walls.D });
}

/** Composes the postcard of a house (a `HouseView`, or `{ parts, roof, walls }`). */
export function composePostcard(
  house: PostcardHouse,
  content: HousingContent = housing,
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
    const kind: 'gable' | 'hip' = run.wing ? 'hip' : 'gable';
    const base = postcardRoofBase(cells);
    return { run, base, kind, height: postcardSlope(base, kind) + EAVE };
  });
  let above = 0;
  for (const roof of roofs)
    above = Math.max(above, (roof.run.top + 1) * POSTCARD_CELL_H + roof.height);

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
    for (let j = 0; j < GRASS_ROWS; j++) r.set(x, groundY + j, lawn(x, j) ?? lawnPal.M);
    for (let j = 0; j < EARTH_ROWS; j++) r.set(x, groundY + GRASS_ROWS + j, earth(x, j) ?? WOOD);
  }

  // chimney and its smoke, before the roofs so the roof covers the foot
  if (chimney !== null) {
    const cy = groundY - chimney.y - spriteSize(CHIMNEY).height;
    r.blit(CHIMNEY, chimney.x, cy);
    r.blit(SMOKE_NEAR, chimney.x + 2, cy - 4);
    r.blit(SMOKE_FAR, chimney.x + 5, cy - 7);
  }

  // roofs, lowest first: a taller wall then hides the overhang of a lower roof beside it
  for (const roof of [...roofs].sort((a, b) => a.run.top - b.run.top)) {
    const x = originX + roof.run.from * POSTCARD_CELL_W - OVER;
    const y = groundY - (roof.run.top + 1) * POSTCARD_CELL_H - roof.height;
    drawRoof(r, x, y, roof.base, roof.kind, roofSkin, roof.run.glass && roof.run.top === 0);
  }

  // facades
  const window = windowFor(roofPal, wallPal);
  for (const u of [...units].sort((a, b) => a.floor - b.floor || a.col - b.col)) {
    const x = originX + u.col * POSTCARD_CELL_W;
    const y = groundY - (u.floor + 1) * POSTCARD_CELL_H;
    if (u.kind === 'conservatory') drawGlassCell(r, x, y);
    else {
      for (let j = 0; j < POSTCARD_CELL_H; j++)
        for (let i = 0; i < POSTCARD_CELL_W; i++)
          r.set(x + i, y + j, j === 0 ? wallPal.D : (wallLook(x + i, y + j) ?? wallPal.M));
    }
    // the silhouette: ink where there is no wall beside it, a shade line between two parts
    const left = unitAt(u.floor, u.col - 1);
    const right = unitAt(u.floor, u.col + 1);
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

  // windows, and the door on the Hearth
  for (const u of units) {
    if (u.kind === 'conservatory') continue;
    const x = originX + u.col * POSTCARD_CELL_W;
    const y = groundY - (u.floor + 1) * POSTCARD_CELL_H;
    if (u.kind === 'hearth') r.blit(DOOR, x + 10, y + POSTCARD_CELL_H - spriteSize(DOOR).height);
    else r.blit(window, x + 8, y + 3);
  }

  // grounds
  for (const g of grid.filter((q) => q.outdoor)) {
    const x = originX + g.col * POSTCARD_CELL_W;
    const w = g.w * POSTCARD_CELL_W;
    drawGrounds(r, g.kind, x, groundY, w);
    boxes.push({ kind: 'grounds', roomId: g.roomId, x, y: groundY - 12, w, h: 12 + GRASS_ROWS });
  }

  const sprite = r.sprite();
  return {
    width,
    height,
    groundY,
    sprite,
    placements: [{ sprite, x: 0, y: 0 }],
    boxes,
    clipped: r.clipped,
  };
}

/** A terrace, a garden or a pool: `w` px wide from `x`, on the ground line `groundY`. */
function drawGrounds(r: Raster, kind: string, x: number, groundY: number, w: number): void {
  if (kind === 'terrace') {
    const deck = coloursOf(skinArt('deck', 'ground').tile);
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
    r.blit(PARASOL, x + Math.floor(w / 2) - 5, groundY - 11);
    return;
  }
  if (kind === 'garden') {
    const green = { L: '#9ccc6c', M: '#5a9a58', D: '#467a4c' };
    // a hedge with a scalloped top and a light edge
    const hx = x + 3;
    const hw = 33;
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
    r.blit(TREE, x + w - 15, groundY - 9);
    // flowers in the grass in front
    FLOWERS.forEach((flower, k) => r.blit(flower, x + 6 + k * 8, groundY - 1));
    return;
  }
  if (kind === 'pool') {
    const tile = coloursOf(skinArt('pool-tile', 'ground').tile);
    const water = coloursOf(skinArt('pool-water', 'ground').tile);
    // the coping along the ground line and the basin sunk under it
    for (let i = 2; i < w - 2; i++) r.set(x + i, groundY, i % 4 === 3 ? tile.D : tile.L);
    for (let j = 1; j <= 4; j++) {
      r.set(x + 3, groundY + j, INK);
      r.set(x + w - 4, groundY + j, INK);
      for (let i = 4; i < w - 4; i++) {
        let colour = water.M;
        if (j === 1 && (i % 9 === 2 || i % 9 === 3)) colour = water.L;
        else if (j === 4) colour = water.D;
        else if (j === 3 && i % 11 === 5) colour = water.D;
        r.set(x + i, groundY + j, colour);
      }
    }
    for (let i = 3; i < w - 3; i++) r.set(x + i, groundY + 5, INK);
    r.blit(LADDER, x + 7, groundY - 5);
    r.blit(BOARD, x + w - 16, groundY - 4);
  }
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
