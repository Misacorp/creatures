// Draws the raid bosses' portraits for the raid posts in Discord (the embed's thumbnail) from the
// game's own boss sprites, scaled by whole pixels on a transparent background. The PNGs are committed
// under `public/discord/bosses/`, so the game's site serves them; run again after a boss sprite changes.
//
//   node --experimental-strip-types apps/activity/scripts/boss-portraits.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { png } from './png.mts';

// The app's sources import without file extensions (Vite resolves them); let Node try `.ts` too.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (err) { if (specifier.startsWith('.')) return next(specifier + '.ts', context); throw err; }
    }`),
);
const { BOSS_SPRITE_DATA } = await import('../src/sprites/data/boss-sprites.ts');

/** Output pixels per sprite pixel: a 24-pixel sprite becomes 240 pixels, with a sprite pixel of margin. */
const UNIT = 10;
const MARGIN = 1;

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const outDir = resolve(fileURLToPath(import.meta.url), '../../public/discord/bosses');
mkdirSync(outDir, { recursive: true });
for (const [id, def] of Object.entries(BOSS_SPRITE_DATA)) {
  const rows = def.rows.map((row) =>
    def.mirror === true ? row + [...row].reverse().join('') : row,
  );
  const width = ((rows[0]?.length ?? 0) + 2 * MARGIN) * UNIT;
  const height = (rows.length + 2 * MARGIN) * UNIT;
  const pixels = new Uint8Array(width * height * 4);
  for (const [y, row] of rows.entries()) {
    for (const [x, key] of [...row].entries()) {
      const colour = def.palette[key];
      if (key === '.' || colour === undefined) continue;
      const [r, g, b] = rgb(colour);
      for (let yy = 0; yy < UNIT; yy++) {
        for (let xx = 0; xx < UNIT; xx++) {
          const px = (x + MARGIN) * UNIT + xx;
          const py = (y + MARGIN) * UNIT + yy;
          pixels.set([r, g, b, 255], (py * width + px) * 4);
        }
      }
    }
  }
  writeFileSync(join(outDir, `${id}.png`), png(pixels, width, height, 4));
}
console.log(`wrote ${String(Object.keys(BOSS_SPRITE_DATA).length)} portraits to ${outDir}`);
