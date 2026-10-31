/**
 * `wearing(sprite, looks)`: a 16x16 creature sprite with its worn gear drawn on it, as a new sprite of
 * the same size (so no layout changes). Pure and deterministic; the shapes are in `data/worn-sprites.ts`.
 *
 * Anchors are found from the creature's own pixels, never placed per species:
 *
 * - **Face.** Rows 8 to 10, x 3 to 12 are never painted, whatever the piece.
 * - **Hat.** The head top is the first row (from the top, at most row 6) where x 5 to 10 are all
 *   filled: ears, antlers, horns and flames stand beside or above that row, so the hat lands between
 *   them. The hat's bottom row is the row under the head top (it covers the outline and one body row),
 *   it is centred on x 7.5, and it is never lower than row 7. A hat that would reach above row 0
 *   (a tall head, a crest) moves down until its top row is row 0. A hat paints over what is there.
 * - **Scarf.** Rows 11 and 12 (the two rows under the mouth), painted only on
 *   the body's inside on that row: the run of filled pixels around the centre that ends at the first
 *   ink pixel on each side, so fins, wings and tails beside the body stay clear. The tail hangs under
 *   the band at x 10 and 11, over the same inside.
 * - **Charm.** Its bottom row sits on the body's bottom outline (the lowest row where x 6 to 9 are all
 *   filled), so its ink joins the outline; it is never higher than row 11. It is centred on x 7.5 and
 *   paints over the body only.
 *
 * Colours: a worn piece's tint is re-keyed under its slot's own keys, hat `1 2 3`, scarf `4 5 6`, charm
 * `7 8 9` (main, shade, highlight), and the shared ones `K` ink, `G` gold, `W` cream and `C` cord, so
 * the three slots tint apart and a shiny body palette (`swapPalette`) never touches them.
 */
import {
  CHARM_SHAPES,
  HAT_SHAPES,
  SCARF_SHAPES,
  SCARF_TAIL_X,
  classSlot,
  type WornClass,
  type WornSlot,
} from './data/worn-sprites';
import { expandRows, validateSprite, type SpriteDef } from './sprite-data';

const SIZE = 16;
const TRANSPARENT = '.';
/** The creature's outline colour key in every species sprite. */
const BODY_INK = 'k';

/** The face: nothing is painted here (rows 8 to 10, x 3 to 12). */
export function isFace(x: number, y: number): boolean {
  return y >= 8 && y <= 10 && x >= 3 && x <= 12;
}

/** What a worn piece looks like: its shape class, whether it is a set piece (gold trim) and its tint. */
export interface WornLook {
  cls: WornClass;
  set: boolean;
  /** Main, shade and highlight colours (`#rgb` or `#rrggbb`). */
  colours: { t: string; u: string; h: string };
}

const SLOT_KEYS: Readonly<Record<WornSlot, { t: string; u: string; h: string }>> = {
  hat: { t: '1', u: '2', h: '3' },
  scarf: { t: '4', u: '5', h: '6' },
  charm: { t: '7', u: '8', h: '9' },
};

const SHARED_COLOURS = { K: '#0d0a1a', G: '#f6d56a', W: '#fff6d8', C: '#c9a66b' } as const;

type Grid = string[][];

/** Turns a shape character into a palette key of the slot (or `.` for nothing). */
function keyOf(ch: string, slot: WornSlot, set: boolean): string {
  const keys = SLOT_KEYS[slot];
  switch (ch) {
    case 'k':
      return 'K';
    case 't':
      return keys.t;
    case 'u':
      return keys.u;
    case 'h':
      return keys.h;
    case 'c':
      return 'C';
    case 'x':
      return set ? 'G' : keys.u;
    case 'y':
      return set ? 'W' : keys.h;
    case 'z':
      return set ? 'G' : 'K';
    default:
      return TRANSPARENT;
  }
}

function filled(grid: Grid, x: number, y: number): boolean {
  const cell = grid[y]?.[x];
  return cell !== undefined && cell !== TRANSPARENT;
}

/** The first row where x 5 to 10 are all filled, as the head top; row 5 when no row is. */
function headTop(grid: Grid): number {
  for (let y = 0; y <= 6; y++) {
    if ([5, 6, 7, 8, 9, 10].every((x) => filled(grid, x, y))) return y;
  }
  return 5;
}

/** The lowest row where x 6 to 9 are all filled: the body's bottom outline. */
function bodyBottom(grid: Grid): number {
  for (let y = SIZE - 1; y >= 11; y--) {
    if ([6, 7, 8, 9].every((x) => filled(grid, x, y))) return y;
  }
  return 13;
}

/** The inside of the body on a row: from the centre outwards to (not including) the first ink or gap; null for none. */
function inside(grid: Grid, y: number): { from: number; to: number } | null {
  const open = (x: number): boolean => filled(grid, x, y) && grid[y]?.[x] !== BODY_INK;
  if (!open(7) || !open(8)) return null;
  let from = 7;
  while (open(from - 1)) from--;
  let to = 8;
  while (open(to + 1)) to++;
  return { from, to };
}

function paint(grid: Grid, x: number, y: number, key: string): void {
  if (key === TRANSPARENT || x < 0 || x >= SIZE || y < 0 || y >= SIZE || isFace(x, y)) return;
  const row = grid[y];
  if (row !== undefined) row[x] = key;
}

/** The left-half rows of a shape drawn mirrored; returns the cells as [x, y, character]. */
function mirrored(rows: readonly string[], left: number, top: number): [number, number, string][] {
  const cells: [number, number, string][] = [];
  for (const [dy, row] of rows.entries()) {
    const full = row + [...row].reverse().join('');
    for (const [dx, ch] of [...full].entries()) {
      if (ch !== TRANSPARENT) cells.push([left + dx, top + dy, ch]);
    }
  }
  return cells;
}

function wearHat(grid: Grid, look: WornLook): void {
  const rows = HAT_SHAPES[look.cls as keyof typeof HAT_SHAPES].rows;
  const height = rows.length;
  const half = rows[0]?.length ?? 0;
  const bottom = Math.min(headTop(grid) + 1, 7);
  const top = Math.max(0, bottom - height + 1);
  for (const [x, y, ch] of mirrored(rows, SIZE / 2 - half, top)) {
    paint(grid, x, y, keyOf(ch, 'hat', look.set));
  }
}

function wearScarf(grid: Grid, look: WornLook): void {
  const shape = SCARF_SHAPES[look.cls as keyof typeof SCARF_SHAPES];
  const put = (x: number, y: number, ch: string): void => {
    const run = inside(grid, y);
    if (run !== null && x >= run.from && x <= run.to)
      paint(grid, x, y, keyOf(ch, 'scarf', look.set));
  };
  for (const [dy, row] of shape.band.entries()) {
    const full = row + [...row].reverse().join('');
    for (const [x, ch] of [...full].entries()) put(x, 11 + dy, ch);
  }
  for (const [dy, row] of shape.tail.entries()) {
    for (const [dx, ch] of [...row].entries())
      put(SCARF_TAIL_X + dx, 11 + shape.band.length + dy, ch);
  }
}

function wearCharm(grid: Grid, look: WornLook): void {
  const rows = CHARM_SHAPES[look.cls as keyof typeof CHARM_SHAPES].rows;
  const half = rows[0]?.length ?? 0;
  const top = Math.max(11, bodyBottom(grid) - rows.length + 1);
  for (const [x, y, ch] of mirrored(rows, SIZE / 2 - half, top)) {
    if (filled(grid, x, y)) paint(grid, x, y, keyOf(ch, 'charm', look.set));
  }
}

/**
 * The creature with its gear on. One piece is worn per slot: when `looks` holds several of a slot, the
 * last one given wins. Pieces of different slots may come in any order. A sprite that is not 16x16 comes back unchanged.
 */
export function wearing(sprite: SpriteDef, looks: readonly WornLook[]): SpriteDef {
  validateSprite(sprite);
  const rows = expandRows(sprite);
  if (rows.length !== SIZE || rows.some((row) => [...row].length !== SIZE) || looks.length === 0) {
    return sprite;
  }
  const grid: Grid = rows.map((row) => [...row]);
  const bySlot = new Map<WornSlot, WornLook>();
  for (const look of looks) bySlot.set(classSlot(look.cls), look);
  const palette: Record<string, string> = { ...sprite.palette };
  for (const slot of ['hat', 'scarf', 'charm'] as const) {
    const look = bySlot.get(slot);
    if (look === undefined) continue;
    const keys = SLOT_KEYS[slot];
    palette[keys.t] = look.colours.t;
    palette[keys.u] = look.colours.u;
    palette[keys.h] = look.colours.h;
    Object.assign(palette, SHARED_COLOURS);
  }
  const hat = bySlot.get('hat');
  if (hat !== undefined) wearHat(grid, hat);
  const scarf = bySlot.get('scarf');
  if (scarf !== undefined) wearScarf(grid, scarf);
  const charm = bySlot.get('charm');
  if (charm !== undefined) wearCharm(grid, charm);
  const result: SpriteDef = { rows: grid.map((row) => row.join('')), palette };
  validateSprite(result, { width: SIZE, height: SIZE });
  return result;
}
