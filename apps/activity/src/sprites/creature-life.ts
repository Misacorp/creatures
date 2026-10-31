/**
 * Small signs of life for creature sprites (16x16, the shared face): a blink, and for shiny
 * creatures a twinkle just outside the silhouette. Everything here is pure; `life-clock.ts` decides
 * when each one happens. The blink and the twinkle are derived from the sprite, so every species
 * gets them without extra art.
 */
import { expandRows, type SpriteDef } from './sprite-data';

/** The rows of the shared face (`docs/design/creatures.md`, "Art direction for sprites"). */
const EYE_TOP = 8;
const EYE_BOTTOM = 9;
/** Each eye is 2 wide: the left one at x 4-5, the right one at x 10-11. */
const EYES: readonly { x: number; outside: number }[] = [
  { x: 4, outside: 3 },
  { x: 10, outside: 12 },
];

/** The eye pixels as `[x, y]`: the only pixels a blink may change. */
export const EYE_PIXELS: readonly (readonly [number, number])[] = EYES.flatMap(({ x }) =>
  [EYE_TOP, EYE_BOTTOM].flatMap((y) => [[x, y] as const, [x + 1, y] as const]),
);

function replaceChar(row: string, x: number, ch: string): string {
  return row.slice(0, x) + ch + row.slice(x + 1);
}

/**
 * The sprite with its eyes shut: on each eye, row 9 is an ink line and row 8 takes the colour of the
 * pixel just outside the eye. The result has no `mirror` (it is the full grid) and the same size.
 * A sprite that is not 16 wide, or has no face there, comes back unchanged.
 */
export function blinkSprite(def: SpriteDef): SpriteDef {
  const rows = expandRows(def);
  if (rows.length < EYE_BOTTOM + 1 || (rows[0]?.length ?? 0) !== 16) return def;
  const ink = rows[EYE_BOTTOM]?.[4];
  if (ink === undefined || ink === '.') return def;
  let top = rows[EYE_TOP] ?? '';
  let bottom = rows[EYE_BOTTOM] ?? '';
  for (const { x, outside } of EYES) {
    const body = top[outside];
    if (body === undefined || body === '.') return def;
    for (const dx of [0, 1]) {
      top = replaceChar(top, x + dx, body);
      bottom = replaceChar(bottom, x + dx, ink);
    }
  }
  const next = [...rows];
  next[EYE_TOP] = top;
  next[EYE_BOTTOM] = bottom;
  return { palette: def.palette, rows: next };
}

/** A pixel of the sprite's grid. */
export interface Spot {
  x: number;
  y: number;
}

/** Palette keys of the sparkle (keys the species sprites do not use). */
const SPARK_CENTRE = '*';
const SPARK_ARM = '+';
const SPARK_COLOURS = { [SPARK_CENTRE]: '#fffdf2', [SPARK_ARM]: '#ffe08a' } as const;
const ARMS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * The places a sparkle can sit: empty pixels within 2 pixels of the body whose four neighbours are
 * empty and inside the grid too, so the whole "plus" fits. A sprite that fills its canvas has none
 * of those, so it falls back to any empty pixel touching the body (the plus then loses the arms
 * that would land on the body). Row by row.
 */
export function twinkleSpots(def: SpriteDef): Spot[] {
  const rows = expandRows(def);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const filled = (x: number, y: number): boolean => {
    const ch = rows[y]?.[x];
    return ch !== undefined && ch !== '.';
  };
  const empty = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && !filled(x, y);
  const within = (x: number, y: number, reach: number): boolean => {
    for (let ny = y - reach; ny <= y + reach; ny++) {
      for (let nx = x - reach; nx <= x + reach; nx++) if (filled(nx, ny)) return true;
    }
    return false;
  };
  const full: Spot[] = [];
  const touching: Spot[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!empty(x, y)) continue;
      if (ARMS.every(([dx, dy]) => empty(x + dx, y + dy)) && within(x, y, 2)) full.push({ x, y });
      else if (within(x, y, 1)) touching.push({ x, y });
    }
  }
  return full.length > 0 ? full : touching;
}

/** Twinkle frames: 0 = none, then dot, plus, dot. */
export type TwinkleFrame = 0 | 1 | 2 | 3;

/** The sprite with one twinkle frame drawn at `spot` (frames 1 and 3: a dot; frame 2: a plus). */
export function twinkleSprite(def: SpriteDef, spot: Spot, frame: TwinkleFrame): SpriteDef {
  if (frame === 0) return def;
  const rows = [...expandRows(def)];
  const put = (x: number, y: number, ch: string): void => {
    const row = rows[y];
    if (row === undefined || x < 0 || x >= row.length || row[x] !== '.') return;
    rows[y] = replaceChar(row, x, ch);
  };
  put(spot.x, spot.y, SPARK_CENTRE);
  if (frame === 2) for (const [dx, dy] of ARMS) put(spot.x + dx, spot.y + dy, SPARK_ARM);
  return { palette: { ...def.palette, ...SPARK_COLOURS }, rows };
}
