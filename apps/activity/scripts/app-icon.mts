// Draws the Discord app icon (and the lounge message's thumbnail) from the game's own Cindle sprite:
// 512x512, the sprite on a dusk disc over the night ground, in the palette of `tokens.css`.
//
//   node --experimental-strip-types apps/activity/scripts/app-icon.mts <out.png>
//
// No dependencies: the PNG is written with node:zlib. Upload the result as the app icon in the Discord
// developer portal (both apps); the lounge message uses the app's icon.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { SPECIES_SPRITE_DATA } from '../src/sprites/data/species-sprites.ts';

const SIZE = 512;
/** One sprite pixel in icon pixels; the 16-pixel sprite is 320 px wide. */
const SCALE = 20;
const NIGHT = '#17132b';
const DUSK = '#241e42';
const LINE = '#4a4170';

const out = process.argv[2];
if (out === undefined) {
  console.error('usage: app-icon.mts <out.png>');
  process.exit(1);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const pixels = new Uint8Array(SIZE * SIZE * 3);
function fill(x: number, y: number, w: number, h: number, hex: string): void {
  const [r, g, b] = rgb(hex);
  for (let yy = Math.max(0, y); yy < Math.min(SIZE, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(SIZE, x + w); xx++) {
      const i = (yy * SIZE + xx) * 3;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }
}

// The ground, then a disc in sprite-sized pixels (so it reads as pixel art), with a quiet outline.
fill(0, 0, SIZE, SIZE, NIGHT);
const cells = Math.ceil(SIZE / SCALE);
const centre = (cells - 1) / 2;
for (const [radius, colour] of [
  [11.6, LINE],
  [10.6, DUSK],
] as const) {
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (Math.hypot(cx - centre, cy - centre) <= radius) {
        fill(
          Math.round(SIZE / 2 + (cx - centre - 0.5) * SCALE),
          Math.round(SIZE / 2 + (cy - centre - 0.5) * SCALE),
          SCALE,
          SCALE,
          colour,
        );
      }
    }
  }
}

const sprite = SPECIES_SPRITE_DATA['cindle'];
if (sprite === undefined) throw new Error('no cindle sprite');
const rows = sprite.rows.map((row) =>
  sprite.mirror === true ? row + [...row].reverse().join('') : row,
);
const width = rows[0]?.length ?? 0;
const left = Math.round((SIZE - width * SCALE) / 2);
const top = Math.round((SIZE - rows.length * SCALE) / 2);
for (const [y, row] of rows.entries()) {
  for (const [x, key] of [...row].entries()) {
    const colour = sprite.palette[key];
    if (key !== '.' && colour !== undefined)
      fill(left + x * SCALE, top + y * SCALE, SCALE, SCALE, colour);
  }
}

// PNG: 8-bit RGB, one filter byte (0) per row.
const raw = new Uint8Array(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++)
  raw.set(pixels.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (SIZE * 3 + 1) + 1);
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
