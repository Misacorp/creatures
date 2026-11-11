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
  isSkyColour,
  levelMap,
  pixelHash,
  shade,
  skyThrough,
  STAR,
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
  const sky = colours.map((c) => material === 'window' && isSkyColour(c));
  const levels = colours.map((c, i): Bytes[] => {
    if (sky[i] === true) {
      const night = skyThrough(c, phase);
      return [night, night, night, night];
    }
    return [
      shade(c, material, phase, 0),
      shade(c, material, phase, 1),
      shade(c, material, phase, 2),
      shade(c, material, phase, 3),
    ];
  });
  const table = { levels, sky };
  byKey.set(key, table);
  return table;
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
