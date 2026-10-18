// Draws the Discord app icon (and so the lounge message's thumbnail) from the game's own pixel art: the
// three starters over an expedition banner, or sitting on the living room's couch in one of its lights.
//
//   node --experimental-strip-types apps/activity/scripts/app-icon.mts <variant> <out.png>
//   node --experimental-strip-types apps/activity/scripts/app-icon.mts all <out-dir>
//
// Variants: `trio-<banner>` (a destination of `banner-sprites.ts`, e.g. `trio-ember-caves`),
// `lounge-<day|twilight|night>` (by the fireplace) and `cindle` (Cindle alone in the Ember Caves). `all` writes every
// variant plus `sheet.png`, a contact sheet of them. No dependencies: the PNG is written with node:zlib.
// Upload the chosen one as the app icon in the Discord developer portal (both apps).
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { png } from './png.mts';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';

// The app's sources import without file extensions (Vite resolves them); let Node try `.ts` too.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (err) { if (specifier.startsWith('.')) return next(specifier + '.ts', context); throw err; }
    }`),
);
const { BANNER_SPRITE_DATA } = await import('../src/sprites/data/banner-sprites.ts');
const { SPECIES_SPRITE_DATA } = await import('../src/sprites/data/species-sprites.ts');
const { roomScene, ROOM_SIZE } = await import('../src/sprites/room-art.ts');

const SIZE = 512;
/** One banner pixel in icon pixels: the banner's 24 rows cover the icon. */
const BANNER_UNIT = 22;
/** One room pixel in icon pixels: a 51-pixel square of the room covers the icon. */
const ROOM_UNIT = 10;

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function rowsOf(def: SpriteDef): string[] {
  return def.rows.map((row) => (def.mirror === true ? row + [...row].reverse().join('') : row));
}

/** A grid of colours (null is transparent), in the art's own pixels. */
class Canvas {
  readonly cells: (string | null)[];
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: width * height }, () => null);
  }
  at(x: number, y: number): string | null {
    const cx = Math.min(this.width - 1, Math.max(0, x));
    const cy = Math.min(this.height - 1, Math.max(0, y));
    return this.cells[cy * this.width + cx] ?? null;
  }
  blit(def: SpriteDef, left: number, top: number): void {
    for (const [y, row] of rowsOf(def).entries()) {
      for (const [x, key] of [...row].entries()) {
        const colour = def.palette[key];
        const cx = left + x;
        const cy = top + y;
        if (key === '.' || colour === undefined) continue;
        if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) continue;
        this.cells[cy * this.width + cx] = colour;
      }
    }
  }
}

/** The icon's pixels, RGB. */
class Icon {
  readonly pixels = new Uint8Array(SIZE * SIZE * 3);
  set(x: number, y: number, hex: string, dim = 1): void {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const [r, g, b] = rgb(hex);
    const i = (y * SIZE + x) * 3;
    this.pixels[i] = Math.round(r * dim);
    this.pixels[i + 1] = Math.round(g * dim);
    this.pixels[i + 2] = Math.round(b * dim);
  }
  /** Draws a canvas with `unit` icon pixels per art pixel, art pixel (fromX, fromY) at the top-left. */
  paint(canvas: Canvas, unit: number, fromX: number, fromY: number, dim = 1): void {
    const offX = Math.round((SIZE % unit) / 2);
    const offY = Math.round((SIZE % unit) / 2);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const colour = canvas.at(
          fromX + Math.floor((x - offX) / unit),
          fromY + Math.floor((y - offY) / unit),
        );
        if (colour !== null) this.set(x, y, colour, dim);
      }
    }
  }
  /** Draws a species sprite with its top-left at (left, top), `unit` icon pixels per sprite pixel. */
  sprite(species: string, unit: number, left: number, top: number): void {
    const def = SPECIES_SPRITE_DATA[species];
    if (def === undefined) throw new Error(`no sprite ${species}`);
    for (const [y, row] of rowsOf(def).entries()) {
      for (const [x, key] of [...row].entries()) {
        const colour = def.palette[key];
        if (key === '.' || colour === undefined) continue;
        for (let yy = 0; yy < unit; yy++) {
          for (let xx = 0; xx < unit; xx++)
            this.set(left + x * unit + xx, top + y * unit + yy, colour);
        }
      }
    }
  }
}

function bannerCanvas(key: string): Canvas {
  const def = BANNER_SPRITE_DATA[key];
  if (def === undefined) throw new Error(`no banner ${key}`);
  const rows = rowsOf(def);
  const canvas = new Canvas(rows[0]?.length ?? 0, rows.length);
  canvas.blit(def, 0, 0);
  return canvas;
}

/** Cindle in front, Splashet and Sproutle a step behind, the same in every variant. */
function drawStarters(icon: Icon): void {
  icon.sprite('splashet', 11, 20, 180);
  icon.sprite('sproutle', 11, SIZE - 20 - 16 * 11, 180);
  icon.sprite('cindle', 14, (SIZE - 16 * 14) / 2, SIZE - 16 * 14 - 40);
}

/** The three starters over a square crop of a banner. */
function trio(banner: string): Icon {
  const icon = new Icon();
  icon.paint(bannerCanvas(banner), BANNER_UNIT, 20, 0, 0.8);
  drawStarters(icon);
  return icon;
}

function cindle(): Icon {
  const icon = new Icon();
  icon.paint(bannerCanvas('ember-caves'), BANNER_UNIT, 20, 0, 0.85);
  icon.sprite('cindle', BANNER_UNIT, (SIZE - 16 * BANNER_UNIT) / 2, SIZE - 16 * BANNER_UNIT - 52);
  return icon;
}

/** The three starters before the living room's fireplace, in one of the room's lights. */
function lounge(phase: 'day' | 'twilight' | 'night'): Icon {
  const canvas = new Canvas(ROOM_SIZE.width, ROOM_SIZE.height);
  for (const layer of ['back', 'front'] as const) {
    for (const prop of roomScene(phase).props) {
      if (prop.layer === layer) canvas.blit(prop.sprite, prop.x, prop.y);
    }
  }
  const icon = new Icon();
  icon.paint(canvas, ROOM_UNIT, 177, 4, 0.85);
  drawStarters(icon);
  return icon;
}

function render(variant: string): Icon {
  if (variant === 'cindle') return cindle();
  if (variant.startsWith('trio-')) return trio(variant.slice('trio-'.length));
  if (variant === 'lounge-day' || variant === 'lounge-twilight' || variant === 'lounge-night') {
    return lounge(variant.slice('lounge-'.length) as 'day' | 'twilight' | 'night');
  }
  throw new Error(`unknown variant ${variant}`);
}

/** Every variant at half size in a grid of `columns`, with a gap of the night colour. */
function sheet(icons: readonly Icon[], columns: number): Buffer {
  const cell = SIZE / 2;
  const gap = 8;
  const rows = Math.ceil(icons.length / columns);
  const width = columns * cell + (columns + 1) * gap;
  const height = rows * cell + (rows + 1) * gap;
  const pixels = new Uint8Array(width * height * 3);
  const [nr, ng, nb] = rgb('#17132b');
  for (let i = 0; i < width * height; i++) pixels.set([nr, ng, nb], i * 3);
  for (const [n, icon] of icons.entries()) {
    const left = gap + (n % columns) * (cell + gap);
    const top = gap + Math.floor(n / columns) * (cell + gap);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const from = (y * 2 * SIZE + x * 2) * 3;
        pixels.set(icon.pixels.subarray(from, from + 3), ((top + y) * width + left + x) * 3);
      }
    }
  }
  return png(pixels, width, height);
}

const [variant, out] = process.argv.slice(2);
if (variant === undefined || out === undefined) {
  console.error('usage: app-icon.mts <variant|all> <out.png|out-dir>');
  process.exit(1);
}
if (variant === 'all') {
  mkdirSync(out, { recursive: true });
  const variants = [
    ...Object.keys(BANNER_SPRITE_DATA).map((b) => `trio-${b}`),
    'lounge-day',
    'lounge-twilight',
    'lounge-night',
  ];
  const icons = variants.map((v) => {
    const icon = render(v);
    writeFileSync(join(out, `${v}.png`), png(icon.pixels, SIZE, SIZE));
    return icon;
  });
  writeFileSync(join(out, 'sheet.png'), sheet(icons, 4));
  console.log(`wrote ${String(variants.length)} icons and sheet.png to ${out}`);
} else {
  writeFileSync(out, png(render(variant).pixels, SIZE, SIZE));
  console.log(`wrote ${out}`);
}
