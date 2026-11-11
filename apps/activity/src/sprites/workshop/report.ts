/**
 * The review report of a furniture set (`docs/design/housing-workshop.md`, "The report"): which pieces look too much
 * like another set's piece of the same form, and which are hard to read at 1x. Pure; the room sheet prints it and
 * writes it next to the PNG.
 *
 * - **Too close**: two pieces of one form are compared by their silhouettes (how much of the two outlines overlap,
 *   intersection over union) and their colours (how far each one's colours are from the other's nearest, weighted by
 *   pixels, 0 to 1). A pair is flagged when the outlines overlap by `CLOSE.overlap` or more and the colours are within
 *   `CLOSE.colour`: the same shape in nearly the same paint.
 * - **Unreadable at 1x**: fewer than `READABLE.tones` colours besides the ink (a flat blob); the inside's contrast
 *   with the wallpaper or floor behind it under `READABLE.contrast` (the ink edge is all that shows it); more than
 *   `READABLE.specks` of its pixels lone specks of a colour (a detail of one pixel that vanishes on a phone); or an
 *   outline filling less than `READABLE.fill` of its box (it reads as a few lines).
 */
import { contrast } from '../sprite-lint';
import { expandRows, type SpriteDef } from '../sprite-data';

const INK = '#0d0a1a';

export const CLOSE = { overlap: 0.85, colour: 0.065 } as const;
export const READABLE = { tones: 3, contrast: 1.35, specks: 0.12, fill: 0.22 } as const;

/** The colour of every pixel, row by row (`''` transparent), in lower case. */
function grid(def: SpriteDef): string[][] {
  return expandRows(def).map((row) =>
    [...row].map((ch) => (ch === '.' ? '' : (def.palette[ch] ?? '').toLowerCase())),
  );
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) / Math.hypot(255, 255, 255);
}

/** Pixel counts of each colour besides the ink. */
export function tones(def: SpriteDef): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of grid(def))
    for (const c of row) if (c !== '' && c !== INK) out.set(c, (out.get(c) ?? 0) + 1);
  return out;
}

/** How much two outlines overlap: drawn in both over drawn in either (0 to 1), from their bottom-left corners. */
export function silhouetteOverlap(a: SpriteDef, b: SpriteDef): number {
  const ga = grid(a);
  const gb = grid(b);
  const h = Math.max(ga.length, gb.length);
  const w = Math.max(ga[0]?.length ?? 0, gb[0]?.length ?? 0);
  let both = 0;
  let either = 0;
  for (let y = 0; y < h; y++) {
    const ra = ga[ga.length - h + y] ?? [];
    const rb = gb[gb.length - h + y] ?? [];
    for (let x = 0; x < w; x++) {
      const ia = (ra[x] ?? '') !== '';
      const ib = (rb[x] ?? '') !== '';
      if (ia && ib) both++;
      if (ia || ib) either++;
    }
  }
  return either === 0 ? 1 : both / either;
}

/** How far apart two pieces' colours are (0 the same, 1 black against white): each colour to the other's nearest, by pixels, both ways. */
export function colourDistance(a: SpriteDef, b: SpriteDef): number {
  const ta = tones(a);
  const tb = tones(b);
  const oneWay = (from: Map<string, number>, to: Map<string, number>): number => {
    let sum = 0;
    let n = 0;
    for (const [c, count] of from) {
      let best = 1;
      for (const d of to.keys()) best = Math.min(best, distance(c, d));
      sum += best * count;
      n += count;
    }
    return n === 0 ? 0 : sum / n;
  };
  if (ta.size === 0 || tb.size === 0) return ta.size === tb.size ? 0 : 1;
  return (oneWay(ta, tb) + oneWay(tb, ta)) / 2;
}

export interface ClosePair {
  a: string;
  b: string;
  overlap: number;
  colour: number;
}

/** The pairs of same-form pieces (one of `mine`, one of `others`) that are too close. */
export function closePairs(
  mine: readonly { id: string; form: string; sprite: SpriteDef }[],
  others: readonly { id: string; form: string; sprite: SpriteDef }[],
): ClosePair[] {
  const out: ClosePair[] = [];
  for (const p of mine) {
    for (const q of others) {
      if (p.form !== q.form || p.id === q.id) continue;
      const overlap = silhouetteOverlap(p.sprite, q.sprite);
      if (overlap < CLOSE.overlap) continue;
      const colour = colourDistance(p.sprite, q.sprite);
      if (colour <= CLOSE.colour) out.push({ a: p.id, b: q.id, overlap, colour });
    }
  }
  return out.sort((x, y) => y.overlap - x.overlap);
}

/** The average colour of a tile (or sprite), ink included: what the eye sees of a wallpaper at 1x. */
export function averageColour(def: SpriteDef): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const row of grid(def)) {
    for (const c of row) {
      if (c === '') continue;
      const [cr, cg, cb] = rgb(c);
      r += cr;
      g += cg;
      b += cb;
      n++;
    }
  }
  if (n === 0) return '#000000';
  const hex = (v: number): string =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The share of a sprite's drawn pixels that are lone specks: a colour (not ink) with no 4-neighbour of the same colour. */
export function speckShare(def: SpriteDef): number {
  const g = grid(def);
  let specks = 0;
  let drawn = 0;
  for (const [y, row] of g.entries()) {
    for (const [x, c] of row.entries()) {
      if (c === '') continue;
      drawn++;
      if (c === INK) continue;
      const same = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx = 0, ny = 0]) => g[ny]?.[nx] === c);
      if (!same) specks++;
    }
  }
  return drawn === 0 ? 0 : specks / drawn;
}

/** The share of its box a sprite's outline covers. */
export function fillShare(def: SpriteDef): number {
  const g = grid(def);
  const area = g.length * (g[0]?.length ?? 0);
  const drawn = g.flat().filter((c) => c !== '').length;
  return area === 0 ? 0 : drawn / area;
}

/** The contrast of a piece's inside (its non-ink pixels, averaged) with the colour behind it. */
export function insideContrast(def: SpriteDef, behind: string): number {
  const t = tones(def);
  if (t.size === 0) return 1;
  const inside: SpriteDef = {
    rows: [
      [...t.entries()]
        .flatMap(([, n], i) => Array<string>(n).fill(String.fromCharCode(97 + i)))
        .join(''),
    ],
    palette: Object.fromEntries([...t.keys()].map((c, i) => [String.fromCharCode(97 + i), c])),
  };
  return contrast(averageColour(inside), behind);
}

export interface Readability {
  tones: number;
  contrast: number;
  specks: number;
  fill: number;
  /** What is wrong, in a few words each; empty when it reads. */
  flags: string[];
}

/** How well a piece reads at 1x on the background behind it (`behind`, an average colour). */
export function readability(def: SpriteDef, behind: string): Readability {
  const n = tones(def).size;
  const c = insideContrast(def, behind);
  const specks = speckShare(def);
  const fill = fillShare(def);
  const flags: string[] = [];
  if (n < READABLE.tones) flags.push(`only ${String(n)} tones besides ink`);
  if (c < READABLE.contrast) flags.push(`inside contrast ${c.toFixed(2)} on its background`);
  if (specks > READABLE.specks) flags.push(`${(specks * 100).toFixed(0)}% lone specks`);
  if (fill < READABLE.fill) flags.push(`fills ${(fill * 100).toFixed(0)}% of its box`);
  return { tones: n, contrast: c, specks, fill, flags };
}
