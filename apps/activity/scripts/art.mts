// The art studio: draws and checks pixel art while it is being made, without a browser. For concept
// sets (`src/sprites/concepts/`) and for shipped sprites. See docs/design/art-studio.md.
//
//   pnpm art <set> [--only id,id] [--out dir]     (out defaults to apps/activity/scratch/art/<set>)
//   pnpm art new creature|boss|item|part|banner
//
// For each sprite of the set it writes `<id>.png`: a large zoom with a coordinate grid (x across the
// top, y down the side, so a fix can be named "row 8, x 4"), the sprite at 1x to 4x on the three
// panel colours, its solid silhouette and each alternative palette. It also writes `<set>.png`, the
// set at 6x with the nearest shipped sprite under each one and a row at 3x among shipped creatures
// (as a player sees them in a list), and prints the lint findings (`src/sprites/sprite-lint.ts`).
// `new` prints a starter grid with the shared chibi face already in place.
// The PNGs are for looking at and for showing Misa; nothing here ships in the game.
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join, resolve } from 'node:path';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import type { Concept, ConceptSet } from '../src/sprites/concepts/index.ts';
import { png } from './png.mts';

// The app's sources import without file extensions (Vite resolves them); let Node try `.ts` too.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (err) { if (specifier.startsWith('.')) return next(specifier + '.ts', context); throw err; }
    }`),
);
const { expandRows } = await import('../src/sprites/sprite-data.ts');
const { lintSprite, nearestSilhouette, PANELS, KIND_SIZE } =
  await import('../src/sprites/sprite-lint.ts');
const { CONCEPT_SETS } = await import('../src/sprites/concepts/index.ts');
const { BUNDLED_CREATURE_SPRITES, BUNDLED_BOSS_SPRITES } =
  await import('../src/sprites/creature-sprites.ts');
const { glyph } = await import('../src/sprites/world-map-font.ts');

/** Digits and a few marks in the 5x7 shape of the world map's letters. */
const EXTRA: Readonly<Record<string, readonly string[]>> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
};

type RGB = [number, number, number];

function hex(colour: string): RGB {
  const full = colour.length === 4 ? `#${[...colour.slice(1)].map((c) => c + c).join('')}` : colour;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

/** An RGB canvas with the few drawing calls the studio needs. */
class Canvas {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number, ground: string) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
    this.rect(0, 0, width, height, ground);
  }
  rect(x: number, y: number, w: number, h: number, colour: string): void {
    const [r, g, b] = hex(colour);
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) {
        const at = (j * this.width + i) * 3;
        this.pixels[at] = r;
        this.pixels[at + 1] = g;
        this.pixels[at + 2] = b;
      }
    }
  }
  sprite(def: SpriteDef, x: number, y: number, scale: number, solid?: string): void {
    for (const [j, row] of expandRows(def).entries()) {
      for (const [i, ch] of [...row].entries()) {
        const colour = def.palette[ch];
        if (ch === '.' || colour === undefined) continue;
        this.rect(x + i * scale, y + j * scale, scale, scale, solid ?? colour);
      }
    }
  }
  /** Text in the 5x7 font at `scale`; returns the width drawn. */
  text(s: string, x: number, y: number, scale: number, colour: string): number {
    let cx = x;
    for (const ch of s) {
      const rows = EXTRA[ch] ?? glyph(ch);
      for (const [j, row] of rows.entries()) {
        for (const [i, c] of [...row].entries()) {
          if (c === '#') this.rect(cx + i * scale, y + j * scale, scale, scale, colour);
        }
      }
      cx += 6 * scale;
    }
    return cx - x;
  }
  save(file: string): void {
    writeFileSync(file, png(this.pixels, this.width, this.height));
  }
}

const textWidth = (s: string, scale: number): number => [...s].length * 6 * scale;
const NIGHT = PANELS[0];
const DUSK = PANELS[1];
const TEXT = '#f4eedc';
const MUTED = '#8f86b8';

function sizeOf(def: SpriteDef): { width: number; height: number } {
  const rows = expandRows(def);
  return { width: rows[0]?.length ?? 0, height: rows.length };
}

/** The close-up card of one sprite. */
function drawCard(id: string, concept: Concept, file: string): void {
  const def = concept.sprite;
  const { width, height } = sizeOf(def);
  const zoom = Math.max(8, Math.floor(320 / Math.max(width, height)));
  const label = 2; // font scale of the axis digits
  const axis = 7 * label + 8;
  const zoomW = width * zoom;
  const zoomH = height * zoom;
  const smallW = width * (1 + 2 + 3 + 4) + 5 * 12;
  const alts = Object.entries(concept.alts ?? {});
  // The silhouette and each alternative palette get a column wide enough for the sprite and its label.
  const colW = Math.max(
    width * 4 + 16,
    ...['silhouette', ...alts.map(([n]) => n)].map((n) => textWidth(n, 2) + 12),
  );
  const right = Math.max(smallW, (alts.length + 1) * colW);
  const W = 24 + axis + zoomW + 32 + right + 24;
  const panelsH = PANELS.length * (height * 4 + 16);
  const H = Math.max(24 + 30 + axis + zoomH, 24 + 30 + panelsH + height * 4 + 60) + 24;
  const c = new Canvas(W, H, NIGHT);
  c.text(id, 24, 18, 3, TEXT);

  // The zoom: a checker for transparent pixels, one-pixel grid lines, a stronger line every 4.
  const ox = 24 + axis;
  const oy = 24 + 30 + axis;
  const rows = expandRows(def);
  for (const [j, row] of rows.entries()) {
    for (const [i, ch] of [...row].entries()) {
      const colour = def.palette[ch];
      const fill =
        ch === '.' || colour === undefined ? ((i + j) % 2 === 0 ? '#2a2448' : '#221d3d') : colour;
      c.rect(ox + i * zoom, oy + j * zoom, zoom, zoom, fill);
    }
  }
  for (let i = 0; i <= width; i++) {
    c.rect(ox + i * zoom, oy, 1, zoomH, i % 4 === 0 ? '#6b628f' : '#3a3360');
  }
  for (let j = 0; j <= height; j++) {
    c.rect(ox, oy + j * zoom, zoomW, 1, j % 4 === 0 ? '#6b628f' : '#3a3360');
  }
  if (def.mirror === true) c.rect(ox + (width / 2) * zoom - 1, oy, 2, zoomH, '#ffd25a');
  for (let i = 0; i < width; i++) {
    const s = String(i);
    const tx = ox + i * zoom + Math.floor((zoom - textWidth(s, label) + label) / 2);
    if (zoom >= textWidth(s, label) || i % 2 === 0) c.text(s, tx, oy - 7 * label - 6, label, MUTED);
  }
  for (let j = 0; j < height; j++) {
    const s = String(j);
    c.text(
      s,
      ox - textWidth(s, label) - 4,
      oy + j * zoom + Math.floor((zoom - 7 * label) / 2),
      label,
      MUTED,
    );
  }

  // Real sizes on each panel colour, then the silhouette and the other palettes at 4x.
  let y = 24 + 30;
  const rx = ox + zoomW + 32;
  for (const panel of PANELS) {
    c.rect(rx - 8, y - 8, right + 8, height * 4 + 16, panel);
    let x = rx;
    for (const scale of [1, 2, 3, 4]) {
      c.sprite(def, x, y + (height * 4 - height * scale), scale);
      x += width * scale + 12;
    }
    y += height * 4 + 16;
  }
  y += 16;
  c.text('silhouette', rx, y, 2, MUTED);
  let ax = rx;
  // Black on a light card, so the shape shows (the solid shape has to read without its colours).
  c.rect(ax - 4, y + 18, width * 4 + 8, height * 4 + 8, TEXT);
  c.sprite(def, ax, y + 22, 4, '#000000');
  for (const [name, overrides] of alts) {
    ax += colW;
    c.text(name, ax, y, 2, MUTED);
    c.sprite({ ...def, palette: { ...def.palette, ...overrides } }, ax, y + 22, 4);
  }
  c.save(file);
}

/**
 * The set at 6x: a row as drawn, a row for each alternative palette (a colour direction to choose),
 * the nearest shipped sprite under each one, and a row at 3x among shipped creatures.
 */
function drawSet(set: ConceptSet, ids: string[], file: string): void {
  const scale = 6;
  const big = ids.map((id) => set.sprites[id]).filter((c) => c !== undefined);
  const maxW = Math.max(...big.map((c) => sizeOf(c.sprite).width)) * scale + 24;
  const maxH = Math.max(...big.map((c) => sizeOf(c.sprite).height)) * scale;
  const col = Math.max(maxW, 170);
  const altNames = [...new Set(big.flatMap((c) => Object.keys(c.alts ?? {})))];
  const lineup = Object.entries(BUNDLED_CREATURE_SPRITES).slice(0, 12);
  const W = Math.max(48 + ids.length * col, 48 + (lineup.length + ids.length) * (16 * 3 + 12));
  const rowH = maxH + 52;
  const H = 64 + rowH * (2 + altNames.length) + 8 + 22 + 16 * 3 + 32;
  const c = new Canvas(W, H, NIGHT);
  c.text(set.title, 24, 18, 3, TEXT);
  const tile = (
    def: SpriteDef,
    x: number,
    y: number,
    text: string,
    ground: string,
    ink: string,
  ): void => {
    c.rect(x, y, col - 12, maxH + 40, ground);
    c.sprite(def, x + 12, y + 8, scale);
    // Cut the label to the tile, so a long role or palette name never runs into the next one.
    c.text(text.slice(0, Math.floor((col - 24) / 12)), x + 12, y + maxH + 18, 2, ink);
  };
  let y = 64;
  for (const alt of [undefined, ...altNames]) {
    for (const [n, concept] of big.entries()) {
      const overrides = alt === undefined ? {} : concept.alts?.[alt];
      if (overrides === undefined) continue;
      const def = { ...concept.sprite, palette: { ...concept.sprite.palette, ...overrides } };
      const text = alt === undefined ? (concept.role ?? ids[n] ?? '') : alt;
      tile(def, 24 + n * col, y, text, DUSK, alt === undefined ? TEXT : MUTED);
    }
    y += rowH;
  }
  for (const [n, concept] of big.entries()) {
    const pool = concept.kind === 'boss' ? BUNDLED_BOSS_SPRITES : BUNDLED_CREATURE_SPRITES;
    const near = nearestSilhouette(concept.sprite, pool);
    const other = near === undefined ? undefined : pool[near.id];
    if (near === undefined || other === undefined) continue;
    tile(
      other,
      24 + n * col,
      y,
      `${near.id.slice(0, 9)} ${String(near.different)}`,
      '#1d1836',
      MUTED,
    );
  }
  y += rowH + 8;
  if (!big.every((concept) => concept.kind === 'creature')) {
    c.save(file);
    return;
  }
  c.text('in a list at 3x', 24, y, 2, MUTED);
  y += 22;
  // Concepts mixed into shipped creatures, as a team or list would show them.
  const mixed: SpriteDef[] = [];
  for (const [n, [, def]] of lineup.entries()) {
    mixed.push(def);
    const concept = n % 3 === 1 ? big[(n - 1) / 3] : undefined;
    if (concept !== undefined) mixed.push(concept.sprite);
  }
  for (const concept of big.slice(Math.ceil(lineup.length / 3))) mixed.push(concept.sprite);
  c.rect(16, y - 8, W - 32, 16 * 3 + 16, DUSK);
  for (const [n, def] of mixed.entries()) c.sprite(def, 24 + n * (16 * 3 + 12), y, 3);
  c.save(file);
}

const STARTER: Readonly<Record<string, string[]>> = {
  creature: [
    '................',
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkhhhhbbkk...',
    '..khhbbbbbbbbk..',
    '.khbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbekbbbbkebbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbqbbbkkbbbqbk.',
    '.kbbbbbbbbbbbbk.',
    '.ksbbbbbbbbbbsk.',
    '..kssbbbbbbssk..',
    '...kkssssssk....',
    '.....kkkkkk.....',
  ],
};

const args = process.argv.slice(2);
if (args[0] === 'new') {
  const kind = (args[1] ?? 'creature') as keyof typeof KIND_SIZE;
  const size = Object.hasOwn(KIND_SIZE, kind) ? KIND_SIZE[kind] : undefined;
  if (size === undefined) {
    console.error(`usage: art.mts new creature|boss|item|part|banner`);
    process.exit(2);
  }
  const rows = STARTER[kind] ?? Array.from({ length: size.height }, () => '.'.repeat(size.width));
  console.log('// palette: k ink #0d0a1a, e #fbf8ec, q #ff8fab, b base, h highlight, s shade');
  console.log(`rows: [\n${rows.map((r) => `  '${r}',`).join('\n')}\n],`);
  process.exit(0);
}
const setId = args[0];
const set = CONCEPT_SETS.find((s) => s.id === setId);
if (set === undefined) {
  console.error(
    `usage: art.mts <set> [--only id,id] [--out dir] | art.mts new <kind>\nsets: ${CONCEPT_SETS.map((s) => s.id).join(', ')}`,
  );
  process.exit(2);
}
const opt = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const only = opt('--only')?.split(',');
const out = resolve(opt('--out') ?? join(import.meta.dirname, '..', 'scratch', 'art', set.id));
mkdirSync(out, { recursive: true });
const ids = Object.keys(set.sprites).filter((id) => only === undefined || only.includes(id));
if (ids.length === 0) {
  console.error(`No sprite matches --only. Ids: ${Object.keys(set.sprites).join(', ')}`);
  process.exit(2);
}
let errors = 0;
for (const id of ids) {
  const concept = set.sprites[id];
  if (concept === undefined) continue;
  const pool = concept.kind === 'boss' ? BUNDLED_BOSS_SPRITES : BUNDLED_CREATURE_SPRITES;
  const findings = lintSprite(concept.sprite, {
    kind: concept.kind,
    element: set.element,
    others: concept.kind === 'creature' || concept.kind === 'boss' ? pool : undefined,
  });
  const near =
    concept.kind === 'creature' || concept.kind === 'boss'
      ? nearestSilhouette(concept.sprite, pool)
      : undefined;
  const nearText =
    near === undefined ? '' : ` (nearest: ${near.id}, ${String(near.different)} px apart)`;
  console.log(
    `${id}: ${findings.length === 0 ? 'clean' : `${String(findings.length)} finding(s)`}${nearText}`,
  );
  for (const f of findings) console.log(`  ${f.level} ${f.rule}: ${f.message}`);
  errors += findings.filter((f) => f.level === 'error').length;
  // Alternatives are choices to show, so their findings are printed but never fail the run.
  for (const [name, overrides] of Object.entries(concept.alts ?? {})) {
    const alt = { ...concept.sprite, palette: { ...concept.sprite.palette, ...overrides } };
    for (const f of lintSprite(alt, { kind: concept.kind, element: set.element })) {
      if (f.rule !== 'grid') console.log(`  (${name}) ${f.level} ${f.rule}: ${f.message}`);
    }
  }
  if (findings.some((f) => f.rule === 'grid')) continue;
  drawCard(id, concept, join(out, `${id}.png`));
}
drawSet(set, ids, join(out, `${set.id}.png`));
console.log(`wrote ${out}`);
process.exit(errors > 0 ? 1 : 0);
