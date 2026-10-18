// Draws the Discord app icon (and so the lounge message's thumbnail) from the game's own pixel art:
// 512x512, starter sprites over a crop of an expedition banner, in the palettes of the sprite data.
//
//   node --experimental-strip-types apps/activity/scripts/app-icon.mts <variant> <out.png>
//
// Variants: `cindle` (Cindle in the Ember Caves), `starters` (all three starters in the Ember Caves).
// No dependencies: the PNG is written with node:zlib. Upload the result as the app icon in the Discord
// developer portal (both apps); the lounge message uses the app's icon.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { BANNER_SPRITE_DATA } from '../src/sprites/data/banner-sprites.ts';
import { SPECIES_SPRITE_DATA } from '../src/sprites/data/species-sprites.ts';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';

const SIZE = 512;
/** One background pixel in icon pixels: the banner's 24 rows cover the icon. */
const SCENE_UNIT = 22;

const [variant, out] = process.argv.slice(2);
if ((variant !== 'cindle' && variant !== 'starters') || out === undefined) {
  console.error('usage: app-icon.mts <cindle|starters> <out.png>');
  process.exit(1);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const pixels = new Uint8Array(SIZE * SIZE * 3);
function fill(x: number, y: number, w: number, h: number, hex: string, dim = 1): void {
  const [r, g, b] = rgb(hex);
  for (let yy = Math.max(0, y); yy < Math.min(SIZE, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(SIZE, x + w); xx++) {
      const i = (yy * SIZE + xx) * 3;
      pixels[i] = Math.round(r * dim);
      pixels[i + 1] = Math.round(g * dim);
      pixels[i + 2] = Math.round(b * dim);
    }
  }
}

function rowsOf(def: SpriteDef): string[] {
  return def.rows.map((row) => (def.mirror === true ? row + [...row].reverse().join('') : row));
}

/** A square crop of a banner, starting at banner column `fromX`, dimmed so the creatures stand out. */
function drawScene(key: string, fromX: number, dim: number): void {
  const def = BANNER_SPRITE_DATA[key];
  if (def === undefined) throw new Error(`no banner ${key}`);
  const rows = rowsOf(def);
  const top = Math.round((SIZE - rows.length * SCENE_UNIT) / 2);
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x * SCENE_UNIT < SIZE + SCENE_UNIT; x++) {
      const colour = def.palette[row[fromX + x] ?? '.'];
      if (colour !== undefined) {
        fill(x * SCENE_UNIT - 8, top + y * SCENE_UNIT, SCENE_UNIT, SCENE_UNIT, colour, dim);
      }
    }
  }
}

/** A species sprite with its top-left corner at (left, top), `unit` icon pixels per sprite pixel. */
function drawSprite(species: string, unit: number, left: number, top: number): void {
  const def = SPECIES_SPRITE_DATA[species];
  if (def === undefined) throw new Error(`no sprite ${species}`);
  for (const [y, row] of rowsOf(def).entries()) {
    for (const [x, key] of [...row].entries()) {
      const colour = def.palette[key];
      if (key !== '.' && colour !== undefined) {
        fill(left + x * unit, top + y * unit, unit, unit, colour);
      }
    }
  }
}

if (variant === 'cindle') {
  // The glow of the cave mouth behind it, its feet on the cracked floor.
  drawScene('ember-caves', 20, 0.85);
  drawSprite('cindle', SCENE_UNIT, (SIZE - 16 * SCENE_UNIT) / 2, SIZE - 16 * SCENE_UNIT - 52);
} else {
  // Splashet and Sproutle a step behind, Cindle in front (drawn last, so it overlaps them).
  const unit = SCENE_UNIT / 2;
  drawScene('ember-caves', 20, 0.8);
  drawSprite('splashet', unit, 20, 180);
  drawSprite('sproutle', unit, SIZE - 20 - 16 * unit, 180);
  drawSprite('cindle', 14, (SIZE - 16 * 14) / 2, SIZE - 16 * 14 - 40);
}

// PNG: 8-bit RGB, one filter byte (0) per row.
const raw = new Uint8Array(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw.set(pixels.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (SIZE * 3 + 1) + 1);
}
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  let c = 0xffffffff;
  for (const byte of body) c = (CRC[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 2; // RGB
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]),
);
console.log(`wrote ${out}`);
