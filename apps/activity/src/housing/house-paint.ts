/**
 * Paints placements of the house scene onto a canvas at one pixel per scene pixel; the canvas is then shown at an integer
 * scale with `image-rendering: pixelated` (CSS), so a 1,500 px wide house is a 1,500 px wide canvas, not a 4,500 px one.
 * Each sprite is rendered to a small canvas once (a roof is one sprite of up to 240 x 55) and stamped with `drawImage`.
 * Where there is no canvas (the tests' fake DOM) nothing is painted. Colours are `#rgb` or `#rrggbb`.
 *
 * Day is painted with `drawImage` as always. Twilight and night go through `rasterize`, a pure pixel pass (`house-light.ts`:
 * the material ramps and the stepped light shapes) whose result is put on the canvas with `putImageData`; it runs when the
 * scene changes (a phase change, a rebuilt house), never per frame.
 */
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

const bitmaps = new WeakMap<SpriteDef, HTMLCanvasElement | null>();

/** `#rgb` / `#rrggbb` to bytes. */
function rgb(hex: string): Rgb {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A sprite as a canvas of its own size, or null where canvases cannot be made. */
function bitmapOf(sprite: SpriteDef): HTMLCanvasElement | null {
  const cached = bitmaps.get(sprite);
  if (cached !== undefined) return cached;
  let result: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    const rows = expandRows(sprite);
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = width > 0 && height > 0 ? canvas.getContext('2d') : null;
    if (ctx !== null && typeof ctx.createImageData === 'function') {
      const image = ctx.createImageData(width, height);
      const colours = new Map<string, Rgb>();
      for (const [key, colour] of Object.entries(sprite.palette)) colours.set(key, rgb(colour));
      for (const [y, row] of rows.entries()) {
        for (let x = 0; x < width; x++) {
          const c = colours.get(row[x] ?? '.');
          if (c === undefined) continue;
          const at = (y * width + x) * 4;
          image.data[at] = c[0];
          image.data[at + 1] = c[1];
          image.data[at + 2] = c[2];
          image.data[at + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      result = canvas;
    }
  }
  bitmaps.set(sprite, result);
  return result;
}

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
  const colours = keys.map((k) => rgb(sprite.palette[k] ?? '#000'));
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

/** What one palette entry becomes at each light level, and whether it is a window's sky. */
interface Table {
  levels: Bytes[][];
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
  const table = { levels, sky, flame };
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
  const phase = lighting?.phase ?? 'day';
  const levels =
    phase === 'day' || lighting === undefined ? null : levelMap(lighting.lights, width, height);
  for (const p of placements) {
    const sprite = pixelsOf(p.sprite);
    const w = Math.min(p.w ?? sprite.width, sprite.width);
    const h = Math.min(p.h ?? sprite.height, sprite.height);
    const table = phase === 'day' ? null : tableOf(p.sprite, p.mat ?? 'auto', phase);
    const sun = phase !== 'day' && p.mat === 'window' ? sunMask(p.sprite) : null;
    for (let y = 0; y < h; y++) {
      const sy = p.y + y;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < w; x++) {
        const sx = p.x + x;
        if (sx < 0 || sx >= width) continue;
        const i = sprite.index[y * sprite.width + x] ?? 0;
        if (i === 0) continue;
        const at = sy * width + sx;
        let c: readonly number[] | undefined;
        if (table === null) c = sprite.colours[i - 1];
        else if (sun !== null && phase !== 'day' && sun[y * sprite.width + x] === 1)
          c = moonColour(phase);
        else if (table.sky[i - 1] === true) {
          c =
            phase === 'night' && pixelHash(sx, sy) % STAR_ONE_IN === 0
              ? STAR
              : table.levels[i - 1]?.[0];
        } else c = table.levels[i - 1]?.[levels?.[at] ?? 0];
        if (c === undefined) continue;
        out[at * 4] = c[0] ?? 0;
        out[at * 4 + 1] = c[1] ?? 0;
        out[at * 4 + 2] = c[2] ?? 0;
        out[at * 4 + 3] = 255;
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
  ctx.imageSmoothingEnabled = false;
  for (const p of placements) {
    const bitmap = bitmapOf(p.sprite);
    if (bitmap === null) continue;
    const w = p.w ?? bitmap.width;
    const h = p.h ?? bitmap.height;
    ctx.drawImage(bitmap, 0, 0, w, h, p.x, p.y, w, h);
  }
}
