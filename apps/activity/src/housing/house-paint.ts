/**
 * Paints placements of the house scene onto a canvas at one pixel per scene pixel; the canvas is then shown at an integer
 * scale with `image-rendering: pixelated` (CSS), so a 1,500 px wide house is a 1,500 px wide canvas, not a 4,500 px one.
 * By day the sprites are stamped by the shared scene painter (`../scene-paint.ts`, which the living room uses too: bitmaps
 * cached per sprite, no size limit); this file adds the lighting pass on top. Where there is no canvas (the tests' fake DOM)
 * nothing is painted.
 *
 * Day is painted with `drawImage` as always. Twilight and night go through `rasterize`, a pure pixel pass (`house-light.ts`:
 * the material ramps and the stepped light shapes) whose result is put on the canvas with `putImageData`; it runs when the
 * scene changes (a phase change, a rebuilt house), never per frame.
 */
import { hexRgb, stamp } from '../scene-paint';
import { expandRows, type SpriteDef } from '../sprites/sprite-data';
import {
  levelMap,
  pixelHash,
  shade,
  STAR,
  moonColour,
  toneOf,
  windowPixel,
  type Lighting,
  type Material,
  type NightPhase,
  type Rgb,
} from './house-light';
import type { Placement } from './house-scene';

/** A sprite's pixels as palette indexes (1 based, 0 transparent) and the palette's colours. */
interface Pixels {
  width: number;
  height: number;
  index: Uint8Array;
  colours: Rgb[];
}

const pixelCache = new WeakMap<SpriteDef, Pixels>();

function pixelsOf(sprite: SpriteDef): Pixels {
  const hit = pixelCache.get(sprite);
  if (hit !== undefined) return hit;
  const rows = expandRows(sprite);
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  const keys = Object.keys(sprite.palette);
  const colours = keys.map((k) => hexRgb(sprite.palette[k] ?? '#000'));
  const index = new Uint8Array(width * height);
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < width; x++) {
      const at = keys.indexOf(row[x] ?? '.');
      if (at >= 0) index[y * width + x] = at + 1;
    }
  }
  const out = { width, height, index, colours };
  pixelCache.set(sprite, out);
  return out;
}

type Bytes = [number, number, number];

/** An opaque colour as one little-endian RGBA word (what `Uint8ClampedArray` holds, read four bytes at a time). */
const pack = (r: number, g: number, b: number): number =>
  ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

/** What one palette entry becomes at each light level, and whether it is a window's sky. */
interface Table {
  levels: Bytes[][];
  /** The same colours packed as little-endian RGBA words (opaque), by level then palette entry. */
  packed: Uint32Array[];
  sky: boolean[];
  /** Flame-coloured entries (a window's drawn sun is one of them: see `sunMask`). */
  flame: boolean[];
}

const tables = new WeakMap<SpriteDef, Map<string, Table>>();

function tableOf(sprite: SpriteDef, material: Material, phase: NightPhase): Table {
  let byKey = tables.get(sprite);
  if (byKey === undefined) {
    byKey = new Map();
    tables.set(sprite, byKey);
  }
  const key = `${phase}|${material}`;
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const { colours } = pixelsOf(sprite);
  const windows = colours.map((c) => (material === 'window' ? windowPixel(c, phase) : null));
  const sky = windows.map((w) => w?.star === true);
  const levels = colours.map((c, i): Bytes[] => {
    const w = windows[i];
    if (w !== undefined && w !== null) return [w.colour, w.colour, w.colour, w.colour];
    return [
      shade(c, material, phase, 0),
      shade(c, material, phase, 1),
      shade(c, material, phase, 2),
      shade(c, material, phase, 3),
    ];
  });
  const flame = colours.map((c) => toneOf(c) === 'flame');
  const packed = [0, 1, 2, 3].map((level) =>
    Uint32Array.from(levels, (l) => {
      const c = l[level] ?? l[0] ?? [0, 0, 0];
      return pack(c[0], c[1], c[2]);
    }),
  );
  const table = { levels, packed, sky, flame };
  byKey.set(key, table);
  return table;
}

const sunMasks = new WeakMap<SpriteDef, Uint8Array>();

/**
 * The pixels of a window's drawn sun: flame-coloured pixels with a sky-coloured pixel beside them (the curtain's gold tie-back
 * touches cloth only). At night they become the moon.
 */
function sunMask(sprite: SpriteDef): Uint8Array {
  const hit = sunMasks.get(sprite);
  if (hit !== undefined) return hit;
  const px = pixelsOf(sprite);
  const flame = px.colours.map((c) => toneOf(c) === 'flame');
  const sky = px.colours.map((c) => windowPixel(c, 'night') !== null);
  const mask = new Uint8Array(px.width * px.height);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= px.width || y >= px.height ? 0 : (px.index[y * px.width + x] ?? 0);
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      const i = at(x, y);
      if (i === 0 || flame[i - 1] !== true) continue;
      const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (near.some((n) => n !== 0 && sky[n - 1] === true)) mask[y * px.width + x] = 1;
    }
  }
  sunMasks.set(sprite, mask);
  return mask;
}

/** One star in this many sky pixels of a window at night. */
const STAR_ONE_IN = 19;

/**
 * Paints the placements, in order, into RGBA bytes (`width` x `height`, transparent where nothing is painted). With no
 * lighting, or in the day, it is exactly the sprites' own colours (a test holds it to that); at twilight and night every
 * pixel goes through its material's ramp and the light level under it.
 */
export function rasterize(
  placements: readonly Placement[],
  width: number,
  height: number,
  lighting?: Lighting,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const words = new Uint32Array(out.buffer);
  const phase = lighting?.phase ?? 'day';
  const levels =
    phase === 'day' || lighting === undefined ? null : levelMap(lighting.lights, width, height);
  for (const p of placements) {
    const sprite = pixelsOf(p.sprite);
    const w = Math.min(p.w ?? sprite.width, sprite.width);
    const h = Math.min(p.h ?? sprite.height, sprite.height);
    const x0 = Math.max(0, -p.x);
    const x1 = Math.min(w, width - p.x);
    const index = sprite.index;
    if (phase === 'day' || levels === null) {
      const packedDay = Uint32Array.from(sprite.colours, (c) => pack(c[0], c[1], c[2]));
      for (let y = Math.max(0, -p.y); y < h && p.y + y < height; y++) {
        const row = y * sprite.width;
        const base = (p.y + y) * width + p.x;
        for (let x = x0; x < x1; x++) {
          const i = index[row + x] ?? 0;
          if (i !== 0) words[base + x] = packedDay[i - 1] ?? 0;
        }
      }
      continue;
    }
    const table = tableOf(p.sprite, p.mat ?? 'auto', phase);
    const sun = p.mat === 'window' ? sunMask(p.sprite) : null;
    const moon = pack(...moonColour(phase));
    const star = pack(STAR[0], STAR[1], STAR[2]);
    const { packed, sky } = table;
    const lit0 = packed[0];
    for (let y = Math.max(0, -p.y); y < h && p.y + y < height; y++) {
      const row = y * sprite.width;
      const base = (p.y + y) * width + p.x;
      for (let x = x0; x < x1; x++) {
        const i = index[row + x] ?? 0;
        if (i === 0) continue;
        const at = base + x;
        if (sun !== null && sun[row + x] === 1) words[at] = moon;
        else if (sky[i - 1] === true) {
          words[at] =
            phase === 'night' && pixelHash(p.x + x, p.y + y) % STAR_ONE_IN === 0
              ? star
              : (lit0?.[i - 1] ?? 0);
        } else words[at] = packed[levels[at] ?? 0]?.[i - 1] ?? 0;
      }
    }
  }
  return out;
}

/**
 * Clears the canvas and paints the placements in order. A crop (`w`, `h`) draws the top left part of its sprite. Without
 * `lighting`, or by day, the sprites are stamped as drawn; otherwise the lighting pass paints them (`rasterize`).
 */
export function paintPlacements(
  ctx: CanvasRenderingContext2D | null,
  placements: readonly Placement[],
  width: number,
  height: number,
  lighting?: Lighting,
): void {
  if (ctx === null) return;
  ctx.clearRect(0, 0, width, height);
  if (lighting !== undefined && lighting.phase !== 'day') {
    if (width > 0 && height > 0 && typeof ImageData !== 'undefined') {
      const bytes = rasterize(placements, width, height, lighting);
      ctx.putImageData(new ImageData(bytes, width, height), 0, 0);
    }
    return;
  }
  stamp(ctx, placements);
}
