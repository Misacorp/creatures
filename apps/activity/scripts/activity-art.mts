// Draws the Activity's art assets for the Discord developer portal from the game's own pixel art: the
// living room at dawn, its window in view, with creatures sitting around it. Nothing here ships in the
// game; the output is uploaded by hand (Developer Portal, the app, Activities, Art Assets).
//
//   CHROME=<path to chrome> node --experimental-strip-types apps/activity/scripts/activity-art.mts <out-dir>
//
// Writes, to Discord's specs (docs.discord.com, Activities, "Assets and metadata"):
// - cover.png (1920x1080): the Activity Shelf image, with the title. Discord shows it at 16:9 and cropped
//   to 13:11, so the title, the window and the couch sit in the middle.
// - background.png (1920x1080): the grid view's background. No title, and dimmed in the middle so the
//   Activity's own UI stays readable over it.
// - preview.mp4 (640x360, 6 s, H.264): the hover video, the cover's scene with the creatures hopping.
// The room is scaled by whole pixels (nearest neighbour). The title is the game's own (Jersey 10, gold,
// ink and plum shadow), drawn by headless Chrome; frames are joined by ffmpeg, so both must be installed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import { png } from './png.mts';

// The app's sources import without file extensions (Vite resolves them); let Node try `.ts` too.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (err) { if (specifier.startsWith('.')) return next(specifier + '.ts', context); throw err; }
    }`),
);
const { SPECIES_SPRITE_DATA } = await import('../src/sprites/data/species-sprites.ts');
const { roomScene, ROOM_SIZE, ROOM_SPOTS, EDGE_TILE_WIDTH, ROOM_BAND_HEIGHT } =
  await import('../src/sprites/room-art.ts');

/** Dawn: the room's twilight light (daylight through the window and the lamps still on). */
const PHASE = 'twilight';
/** Who sits where. The window sill stays free, so the dawn sky shows. */
const SEATS: readonly [spot: string, species: string][] = [
  ['window-floor', 'splashet'],
  ['window-cushion', 'zipmouse'],
  ['couch-left', 'mossback'],
  ['couch-middle', 'cindle'],
  ['couch-right', 'sproutle'],
  ['table-chair-left', 'mistnewt'],
  ['table-chair-right', 'ashmole'],
  ['table-stool', 'coralynx'],
  ['fire-mantel', 'pyrelynx'],
  ['fire-rug-left', 'hearthshell'],
];
/** Wall and floor continue past the room's left edge, so a crop can start left of it. */
const PAD = 3 * EDGE_TILE_WIDTH;
/** The room column at the middle of every asset: between the window and the couch. */
const CENTRE_X = 52;
/** The hover video: frames per second of the pixel animation and the number of frames (6 s). */
const ANIM_FPS = 4;
const ANIM_FRAMES = 24;
const NIGHT = '#17132b';

function rowsOf(def: SpriteDef): string[] {
  return def.rows.map((row) => (def.mirror === true ? row + [...row].reverse().join('') : row));
}

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** The padded room in room pixels (column 0 is room x `-PAD`). `frame` makes creatures hop in turn. */
function roomPixels(frame: number): { width: number; cells: (string | null)[] } {
  const width = ROOM_SIZE.width + PAD;
  const { height } = ROOM_SIZE;
  const cells: (string | null)[] = Array.from({ length: width * height }, () => null);
  const blit = (def: SpriteDef, left: number, top: number): void => {
    for (const [y, row] of rowsOf(def).entries()) {
      for (const [x, key] of [...row].entries()) {
        const colour = def.palette[key];
        const cx = left + x + PAD;
        const cy = top + y;
        if (key === '.' || colour === undefined) continue;
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
        cells[cy * width + cx] = colour;
      }
    }
  };
  const scene = roomScene(PHASE);
  for (let x = -PAD; x < 0; x += EDGE_TILE_WIDTH) blit(scene.edgeTile, x, 0);
  for (const prop of scene.props) if (prop.layer === 'back') blit(prop.sprite, prop.x, prop.y);
  const seated = SEATS.map(([id, species], i) => ({
    i,
    species,
    spot: ROOM_SPOTS.find((s) => s.id === id),
  })).sort((a, b) => (a.spot?.z ?? 0) - (b.spot?.z ?? 0));
  for (const { i, species, spot } of seated) {
    const def = SPECIES_SPRITE_DATA[species];
    if (def === undefined || spot === undefined) continue;
    // Each creature hops one pixel for one frame, a few frames after its neighbour.
    const hop = (frame + i * 5) % 12 === 0 ? 1 : 0;
    blit(def, spot.x, spot.y - hop);
  }
  for (const prop of scene.props) if (prop.layer === 'front') blit(prop.sprite, prop.x, prop.y);
  return { width, cells };
}

interface Shot {
  width: number;
  height: number;
  /** Output pixels per room pixel. */
  unit: number;
  /** The brightness at each output column (1 is unchanged). */
  light?: (x: number) => number;
}

/**
 * RGB pixels: the room at the bottom of the frame, `CENTRE_X` in the middle; above it the wall's top
 * row continues, a calm band for the title. Columns past the room repeat its edge.
 */
function render(shot: Shot, frame: number): Uint8Array {
  const { width, height, unit } = shot;
  const room = roomPixels(frame);
  const top = height - ROOM_SIZE.height * unit;
  const left = Math.round(width / 2 - (CENTRE_X + PAD) * unit);
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const ry = Math.min(ROOM_SIZE.height - 1, Math.max(0, Math.floor((y - top) / unit)));
    for (let x = 0; x < width; x++) {
      const rx = Math.min(room.width - 1, Math.max(0, Math.floor((x - left) / unit)));
      const [r, g, b] = rgb(room.cells[ry * room.width + rx] ?? NIGHT);
      const k = shot.light?.(x) ?? 1;
      out.set([Math.round(r * k), Math.round(g * k), Math.round(b * k)], (y * width + x) * 3);
    }
  }
  return out;
}

/** The title on a transparent page of the given size, drawn by headless Chrome. */
function title(
  chrome: string,
  dir: string,
  width: number,
  height: number,
  bandHeight: number,
): string {
  const font = resolve(
    fileURLToPath(import.meta.url),
    '../../node_modules/@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff2',
  );
  const px = Math.max(1, Math.round(height / 180));
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: J; src: url('file://${font}') format('woff2'); }
    html, body { margin: 0; width: ${String(width)}px; height: ${String(height)}px; background: transparent; }
    h1 { position: absolute; top: 0; left: 0; right: 0; height: ${String(bandHeight)}px; margin: 0;
      display: flex; align-items: center; justify-content: center;
      font: ${String(Math.round(height * 0.18))}px J; color: #ffd25a; letter-spacing: 0.02em;
      text-shadow: ${String(px)}px ${String(px)}px 0 #0d0a1a, ${String(px * 2)}px ${String(px * 2)}px 0 #6b3fa0; }
  </style><h1>Leet Creatures</h1>`;
  const page = join(dir, 'title.html');
  const out = join(dir, 'title.png');
  writeFileSync(page, html);
  const run = spawnSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--default-background-color=00000000',
      `--window-size=${String(width)},${String(height)}`,
      '--virtual-time-budget=2000',
      `--screenshot=${out}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  );
  if (run.status !== 0) throw new Error('chrome failed');
  return out;
}

function ffmpeg(args: readonly string[]): void {
  const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error('ffmpeg failed');
}

const [outDir] = process.argv.slice(2);
const chrome = process.env['CHROME'];
if (outDir === undefined || chrome === undefined || chrome === '') {
  console.error('usage: CHROME=<chrome> activity-art.mts <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'activity-art-'));
try {
  const cover: Shot = { width: 1920, height: 1080, unit: 15 };
  // The title is centred over the calm wall: above the room and its own plain top band.
  const coverBand = cover.height - (ROOM_SIZE.height - ROOM_BAND_HEIGHT) * cover.unit;
  writeFileSync(join(tmp, 'cover.png'), png(render(cover, 1), cover.width, cover.height));
  ffmpeg([
    '-i',
    join(tmp, 'cover.png'),
    '-i',
    title(chrome, tmp, cover.width, cover.height, coverBand),
    '-filter_complex',
    'overlay',
    join(outDir, 'cover.png'),
  ]);

  // Dim in the middle, full light at the edges, so the Activity's UI reads over it.
  const background: Shot = {
    width: 1920,
    height: 1080,
    unit: 15,
    light: (x) => 0.35 + 0.6 * Math.min(1, Math.abs(x / 1920 - 0.5) * 2.5),
  };
  writeFileSync(
    join(outDir, 'background.png'),
    png(render(background, 1), background.width, background.height),
  );

  // The cover at a third of its size, so the hover video continues it exactly.
  const video: Shot = { width: 640, height: 360, unit: 5 };
  const videoBand = video.height - (ROOM_SIZE.height - ROOM_BAND_HEIGHT) * video.unit;
  for (let f = 0; f < ANIM_FRAMES; f++) {
    const name = join(tmp, `f${String(f).padStart(3, '0')}.png`);
    writeFileSync(name, png(render(video, f), video.width, video.height));
  }
  ffmpeg([
    '-framerate',
    String(ANIM_FPS),
    '-i',
    join(tmp, 'f%03d.png'),
    '-i',
    title(chrome, tmp, video.width, video.height, videoBand),
    '-filter_complex',
    '[0][1]overlay,fps=30',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    '-an',
    join(outDir, 'preview.mp4'),
  ]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`wrote cover.png, background.png and preview.mp4 to ${outDir}`);
