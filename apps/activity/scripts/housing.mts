// The furniture workshop's command (docs/design/housing-workshop.md). No browser, about a second.
//
//   pnpm housing sheet <style> [--out dir]        the nine pieces of a style, generated, at 1x and 4x
//   pnpm housing compare [--set id,id] [--out dir]   shipped against generated, every piece of every set
//   pnpm housing lock [--check]                   writes (or checks) src/sprites/workshop/shipped-art.json and art-digest.json
//   pnpm housing new-set <id> | remove-set <id> | check   add, undo and cross-check a set (housing-new-set.mts)
//
// `sheet` and `compare` write PNGs to apps/activity/scratch/housing/ (git ignores it) unless --out is given.
// `compare` prints, per piece, how it is made (generated or the override's kind) and how many pixels the generated
// piece differs from the shipped one. `lock` records a hash of every shipped piece, so a change to the drawing
// library that changes shipped art fails a test until it is looked at and locked again.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join, resolve } from 'node:path';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import type { PieceArt } from '../src/housing/house-art.ts';
import { png } from './png.mts';

register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (err) { if (specifier.startsWith('.')) return next(specifier + '.ts', context); throw err; }
    }`),
);
const { expandRows } = await import('../src/sprites/sprite-data.ts');
const { glyph } = await import('../src/sprites/world-map-font.ts');
const { SET_FORMS } = await import('../src/sprites/workshop/style.ts');
const { generatePiece, makePiece, pieceId, setReport } =
  await import('../src/sprites/workshop/pack.ts');
const { pixelDiff } = await import('../src/sprites/workshop/compare.ts');
const { SHIPPED_SETS, SAMPLE_STYLES, lockOf } = await import('../src/sprites/workshop/sets.ts');
const { artDigest } = await import('../src/sprites/workshop/art-lock.ts');

const ROOT = join(import.meta.dirname, '..');
const LOCK = join(ROOT, 'src', 'sprites', 'workshop', 'shipped-art.json');
const DIGEST = join(ROOT, 'src', 'sprites', 'workshop', 'art-digest.json');
const BACK = '#241e42';
const PANEL = '#2f2857';
const TEXT = '#f4eedc';
const MUTED = '#8f86b8';
const RED = '#ff4d6d';

type RGB = [number, number, number];
const hex = (c: string): RGB => {
  const full = c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
};

class Image {
  readonly px: Uint8Array;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, BACK);
  }
  rect(x: number, y: number, w: number, h: number, colour: string): void {
    const [r, g, b] = hex(colour);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const at = (j * this.w + i) * 3;
        this.px[at] = r;
        this.px[at + 1] = g;
        this.px[at + 2] = b;
      }
    }
  }
  sprite(def: SpriteDef, x: number, y: number, s: number): void {
    for (const [j, row] of expandRows(def).entries()) {
      for (const [i, ch] of [...row].entries()) {
        const colour = def.palette[ch];
        if (ch !== '.' && colour !== undefined) this.rect(x + i * s, y + j * s, s, s, colour);
      }
    }
  }
  text(t: string, x: number, y: number, s: number, colour = TEXT): void {
    let cx = x;
    for (const ch of t.toUpperCase()) {
      const rows = /[A-Z]/.test(ch) ? glyph(ch) : DIGITS[ch];
      for (const [j, row] of (rows ?? []).entries()) {
        for (const [i, c] of [...row].entries())
          if (c === '#') this.rect(cx + i * s, y + j * s, s, s, colour);
      }
      cx += 6 * s;
    }
  }
  save(file: string): void {
    writeFileSync(file, png(this.px, this.w, this.h));
  }
}

const DIGITS: Record<string, readonly string[]> = {
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
  ' ': ['.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
};

/** A piece as the room shows it: the glow behind (offset as the scene puts it), the sprite, the front. */
function drawPiece(
  img: Image,
  art: PieceArt,
  x: number,
  y: number,
  s: number,
  withGlow: boolean,
): void {
  if (withGlow && art.glow !== undefined) {
    const gw = expandRows(art.glow)[0]?.length ?? 0;
    const pw = expandRows(art.sprite)[0]?.length ?? 0;
    img.sprite(art.glow, x + Math.floor((pw - gw) / 2) * s, y + 4 * s, s);
  }
  img.sprite(art.sprite, x, y, s);
  if (art.front !== undefined) img.sprite(art.front, x, y, s);
}

/** The difference mask: the generated sprite dimmed, with every differing pixel red. */
function drawDiff(img: Image, a: SpriteDef, b: SpriteDef, x: number, y: number, s: number): void {
  const ra = expandRows(a);
  const rb = expandRows(b);
  const h = Math.max(ra.length, rb.length);
  const w = Math.max(ra[0]?.length ?? 0, rb[0]?.length ?? 0);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ka = ra[j]?.[i] ?? '.';
      const kb = rb[j]?.[i] ?? '.';
      const ca = ka === '.' ? '' : (a.palette[ka] ?? '');
      const cb = kb === '.' ? '' : (b.palette[kb] ?? '');
      if (ca.toLowerCase() !== cb.toLowerCase()) img.rect(x + i * s, y + j * s, s, s, RED);
      else if (ca !== '') img.rect(x + i * s, y + j * s, s, s, MUTED);
    }
  }
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const command = args[0];

function outDir(name: string): string {
  const dir = resolve(flag('--out') ?? join(ROOT, 'scratch', 'housing', name));
  mkdirSync(dir, { recursive: true });
  return dir;
}

if (command === 'variants' || (command === 'sheet' && args.includes('--room'))) {
  await (await import('./housing-review.mts')).run(args);
} else if (command === 'sheet') {
  const id = args[1] ?? '';
  const style = SAMPLE_STYLES[id] ?? SHIPPED_SETS[id]?.style;
  if (style === undefined) {
    console.error(
      `No style "${id}". Styles: ${[...Object.keys(SAMPLE_STYLES), ...Object.keys(SHIPPED_SETS)].join(', ')}`,
    );
    process.exit(1);
  }
  const S = 4;
  const cell = { w: 56 * S + 16, h: 36 * S + 40 };
  const cols = 3;
  const img = new Image(cols * cell.w + 16, Math.ceil(SET_FORMS.length / cols) * cell.h + 120);
  img.text(style.name, 16, 12, 3);
  // 1x row, as small as the room shows them
  let x1 = 16;
  for (const form of SET_FORMS) {
    const art = generatePiece(form, style);
    drawPiece(img, art, x1, 48, 1, false);
    x1 += (expandRows(art.sprite)[0]?.length ?? 0) + 8;
  }
  for (const [i, form] of SET_FORMS.entries()) {
    const art = generatePiece(form, style);
    const cx = 16 + (i % cols) * cell.w;
    const cy = 100 + Math.floor(i / cols) * cell.h;
    img.rect(cx - 4, cy - 4, cell.w - 8, cell.h - 8, PANEL);
    img.text(form, cx, cy, 2, MUTED);
    drawPiece(img, art, cx, cy + 20, S, true);
  }
  const file = join(outDir(style.id), `${style.id}.png`);
  img.save(file);
  console.log(file);
} else if (command === 'compare') {
  const only = flag('--set')?.split(',');
  const dir = outDir('compare');
  const S = 4;
  const lines: string[] = [];
  for (const [id, source] of Object.entries(SHIPPED_SETS)) {
    if (only !== undefined && !only.includes(id)) continue;
    const report = setReport(source);
    const colW = 56 * S + 24;
    const rowH = 36 * S + 44;
    const img = new Image(3 * colW + 260, SET_FORMS.length * rowH + 60);
    img.text(`${source.style.name}: shipped / generated / difference`, 16, 12, 3);
    for (const [r, form] of SET_FORMS.entries()) {
      const shipped = source.hand?.pieces?.[pieceId(source.style, form)];
      const generated = generatePiece(form, source.style);
      const ships = makePiece(source, form);
      const y = 50 + r * rowH;
      const made = report[r]?.made ?? '?';
      const layers = (['sprite', 'front', 'glow'] as const).flatMap((layer) => {
        const a = shipped?.[layer];
        const b = generated[layer];
        if (a === undefined && b === undefined) return [];
        if (a === undefined || b === undefined) return [`${layer} only one side`];
        const d = pixelDiff(a, b);
        return [`${layer} ${String(d.differ)}/${String(d.area)}`];
      });
      img.text(`${form} ${made}`, 16, y, 2, MUTED);
      if (shipped !== undefined) drawPiece(img, shipped, 16, y + 18, S, true);
      drawPiece(img, generated, 16 + colW, y + 18, S, true);
      if (shipped !== undefined)
        drawDiff(img, shipped.sprite, generated.sprite, 16 + 2 * colW, y + 18, S);
      // 1x: shipped, generated, and what ships now
      const x1 = 16 + 3 * colW;
      if (shipped !== undefined) drawPiece(img, shipped, x1, y + 18, 1, false);
      drawPiece(img, generated, x1 + 60, y + 18, 1, false);
      drawPiece(img, ships, x1 + 120, y + 18, 2, false);
      lines.push(
        `${pieceId(source.style, form).padEnd(26)} ${made.padEnd(10)} ${shipped === undefined ? 'no shipped art' : `differ: ${layers.join(', ')}`}`,
      );
    }
    const counts = report.reduce<Record<string, number>>(
      (n, r) => ({ ...n, [r.made]: (n[r.made] ?? 0) + 1 }),
      {},
    );
    lines.push(
      `${id}: ${Object.entries(counts)
        .map(([k, v]) => `${String(v)} ${k}`)
        .join(', ')}`,
      '',
    );
    img.save(join(dir, `${id}.png`));
  }
  console.log(lines.join('\n'));
  console.log(`\nSheets in ${dir}`);
} else if (command === 'lock') {
  // Two tables: the sets' pieces (shipped-art.json) and every other picture the house is drawn from (art-digest.json).
  const tables = [
    { file: LOCK, text: `${JSON.stringify(lockOf(), null, 2)}\n` },
    { file: DIGEST, text: `${JSON.stringify(artDigest(), null, 2)}\n` },
  ];
  if (args.includes('--check')) {
    let stale = false;
    for (const { file, text } of tables) {
      const old = readFileSync(file, 'utf8');
      if (old !== text) {
        console.error(
          `${file.slice(ROOT.length + 1)} is out of date: shipped art changed. Look at \`pnpm housing compare\` (or the sheets), then run \`pnpm housing lock\`.`,
        );
        stale = true;
      }
    }
    if (stale) process.exit(1);
    console.log('shipped-art.json and art-digest.json are up to date.');
  } else {
    for (const { file, text } of tables) {
      writeFileSync(file, text);
      console.log(`Wrote ${file}`);
    }
  }
} else if (command === 'new-set' || command === 'remove-set' || command === 'check') {
  (await import('./housing-new-set.mts')).main(args);
} else if (command === 'interior-sheets') {
  (await import('./housing-interior.mts')).main(args);
} else {
  console.log(
    'Usage: pnpm housing sheet <style> | compare [--set id,id] | lock [--check] | new-set <id> | remove-set <id> | check | interior-sheets   [--out dir]',
  );
  process.exit(command === undefined ? 0 : 1);
}
