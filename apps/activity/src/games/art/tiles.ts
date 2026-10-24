/**
 * The Valley Games tileset and tilemaps. A tile is 16x16 and may have frames (water drifts in two). A
 * `Tilemap` is rows of one-character tile keys plus a legend from key to tile and tints, with its
 * top-left anywhere in the scene, so a scene stacks several maps (the room, then each bench). With
 * `repeatX` its columns repeat sideways to any width (the Melon Run's world is wider than the screen).
 * `tilemapPlacements` turns a map into sprite placements for `drawSprites`.
 */
import type { SpriteDef } from '../../sprites/sprite-data';
import { GAMES_TILE_DATA, rampPalette, usedPalette, type BaseTileName } from './data/games-tiles';
import { flipX, flipY, rotateCW, shiftX, type Placement } from './pixel';
import { RAMPS, maybeTint, type Ramp, type RampName } from './tint';

export const TILE = 16;

const T = GAMES_TILE_DATA;

/** The same rows with one column set to `key` (an ink side on the end of a bench or a table). */
function withColumn(def: SpriteDef, column: number, key: string, ink: string): SpriteDef {
  const rows = def.rows.map((r) =>
    [...r].map((ch, x) => (x === column && ch !== '.' ? key : ch)).join(''),
  );
  return { rows, palette: { ...def.palette, [key]: ink } };
}

/**
 * The shore's outer corner with land on the north and west sides: each pixel takes the shore's band at
 * its distance from the corner's centre, so it meets the straight edges on both sides seamlessly.
 */
function shoreCorner(): SpriteDef {
  const src = T.shore.rows;
  const rows: string[] = [];
  for (let y = 0; y < TILE; y++) {
    let line = '';
    for (let x = 0; x < TILE; x++) {
      const dist = Math.hypot(TILE - (x + 0.5), TILE - (y + 0.5));
      const band = Math.max(0, Math.min(TILE - 1, Math.floor(TILE - dist)));
      line += src[band]?.[(x + y) % TILE] ?? 'b';
    }
    rows.push(line);
  }
  return { rows, palette: T.shore.palette };
}

/** Rolling hills over two tiles (a 32 px period), lit along their tops; transparent above. */
function hills(): [SpriteDef, SpriteDef] {
  const top = (x: number): number =>
    Math.round(
      7 - 3 * Math.sin((2 * Math.PI * x) / 32) - 1.4 * Math.sin((2 * Math.PI * x) / 16 + 1),
    );
  const halves: string[][] = [[], []];
  for (let y = 0; y < TILE; y++) {
    let line = '';
    for (let x = 0; x < 2 * TILE; x++) {
      const t = top(x);
      let ch = '.';
      if (y === t) ch = top(x - 1) >= t ? 'a' : 'b';
      else if (y > t && y <= t + 2) ch = 'b';
      else if (y > t) ch = (x * 7 + y * 3) % 11 === 0 && y > t + 4 ? 'd' : 'c';
      line += ch;
    }
    halves[0]?.push(line.slice(0, TILE));
    halves[1]?.push(line.slice(TILE));
  }
  const pal = rampPalette(RAMPS.hill);
  const [a = [], b = []] = halves;
  return [
    { rows: a, palette: usedPalette(a, pal) },
    { rows: b, palette: usedPalette(b, pal) },
  ];
}

const shoreE = rotateCW(T.shore);
const corner = shoreCorner();
const [hillsA, hillsB] = hills();

/** Every tile by name, as its frames (most tiles have one). */
export const GAMES_TILES = {
  grass: [T.grass],
  grassEdge: [T.grassEdge],
  grassEdgeTop: [flipY(T.grassEdge)],
  dirt: [T.dirt],
  sand: [T.sand],
  water: [T.water, shiftX(T.water, 5)],
  deepWater: [T.deepWater, shiftX(T.deepWater, -4)],
  shoreN: [T.shore],
  shoreS: [flipY(T.shore)],
  shoreE: [shoreE],
  shoreW: [flipX(shoreE)],
  shoreNW: [corner],
  shoreNE: [flipX(corner)],
  shoreSW: [flipY(corner)],
  shoreSE: [flipX(flipY(corner))],
  planks: [T.planks],
  woodWall: [T.woodWall],
  benchSeat: [T.benchSeat],
  benchSeatL: [withColumn(T.benchSeat, 0, 'k', '#0d0a1a')],
  benchSeatR: [withColumn(T.benchSeat, TILE - 1, 'k', '#0d0a1a')],
  benchSkirt: [T.benchSkirt],
  benchSkirtL: [withColumn(T.benchSkirt, 0, 'k', '#0d0a1a')],
  benchSkirtR: [withColumn(T.benchSkirt, TILE - 1, 'k', '#0d0a1a')],
  stoneWall: [T.stoneWall],
  snow: [T.snow],
  ice: [T.ice],
  cloth: [T.cloth],
  clothL: [withColumn(T.cloth, 0, 'k', '#0d0a1a')],
  clothR: [withColumn(T.cloth, TILE - 1, 'k', '#0d0a1a')],
  fence: [T.fence],
  sky: [T.sky],
  skyLow: [T.skyLow],
  hillsA: [hillsA],
  hillsB: [hillsB],
  bleacher: [T.bleacher],
  bunting: [T.bunting],
} as const satisfies Readonly<Record<string, readonly SpriteDef[]>>;

export type TileName = keyof typeof GAMES_TILES;
export const TILE_NAMES = Object.keys(GAMES_TILES) as TileName[];

/** Base tiles that are drawn by hand (the rest are derived from them). */
export type { BaseTileName };

/** The tile's sprite at an animation frame (frames loop). */
export function tileFrame(name: TileName, frame = 0): SpriteDef {
  const frames: readonly SpriteDef[] = GAMES_TILES[name];
  const sprite = frames[((frame % frames.length) + frames.length) % frames.length];
  if (sprite === undefined) throw new Error(`Tile ${name} has no frames.`);
  return sprite;
}

/** What a legend key stands for: a tile and, optionally, its primary and secondary tints. */
export interface TileRef {
  tile: TileName;
  tint?: RampName;
  tint2?: RampName | Ramp;
}

export interface Tilemap {
  /** One string per tile row, one character per tile; `.` is an empty cell. */
  rows: readonly string[];
  legend: Readonly<Record<string, TileRef>>;
  /** Top-left of the map in scene pixels (default 0, 0). */
  x?: number;
  y?: number;
  /** The columns repeat to the right for as wide as the scene is drawn. */
  repeatX?: boolean;
}

/** The map's size in pixels (one copy of its columns). */
export function tilemapSize(map: Tilemap): { width: number; height: number } {
  return { width: (map.rows[0]?.length ?? 0) * TILE, height: map.rows.length * TILE };
}

/** The sprite of one legend entry at a frame, tinted (memoised by `tintSprite`). */
export function refSprite(ref: TileRef, frame = 0): SpriteDef {
  return maybeTint(tileFrame(ref.tile, frame), ref.tint, ref.tint2);
}

/**
 * The map's tiles as placements. `width` (scene pixels) is how far a `repeatX` map is drawn; other maps
 * draw their columns once. Unknown keys throw, so a typo in a map is caught by the tests.
 */
export function tilemapPlacements(
  map: Tilemap,
  options: { frame?: number; width?: number } = {},
): Placement[] {
  const frame = options.frame ?? 0;
  const ox = map.x ?? 0;
  const oy = map.y ?? 0;
  const out: Placement[] = [];
  for (const [r, row] of map.rows.entries()) {
    const cols =
      map.repeatX === true && options.width !== undefined
        ? Math.max(row.length, Math.ceil((options.width - ox) / TILE))
        : row.length;
    for (let c = 0; c < cols; c++) {
      const key = row[c % row.length] ?? '.';
      if (key === '.') continue;
      const ref = map.legend[key];
      if (ref === undefined) throw new Error(`Tilemap key "${key}" is not in its legend.`);
      out.push({ sprite: refSprite(ref, frame), x: ox + c * TILE, y: oy + r * TILE });
    }
  }
  return out;
}
