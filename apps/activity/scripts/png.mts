// A minimal PNG writer for the art scripts (no dependencies): 8-bit RGB or RGBA, one filter byte (0)
// per row.
import { deflateSync } from 'node:zlib';

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

/** `pixels` holds `channels` bytes a pixel: 3 (RGB) or 4 (RGBA). */
export function png(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4 = 3,
): Buffer {
  const row = width * channels;
  const raw = new Uint8Array(height * (row + 1));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}
