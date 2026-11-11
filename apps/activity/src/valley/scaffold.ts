/**
 * The scaffolding that rises round a place while its project fills (V-COM-6): plain wooden poles and boards standing in front of the
 * place's own art, from the ground up, as high as the project is full. Pixel-exact (it is a sprite the same size as the art, drawn at
 * the scene's scale like everything else); nothing here draws a number or a name. Pure.
 *
 * A place that lies flat on the ground (the hearth, the Paddock, the Signpost's road) has no height to scaffold: it gets
 * a ground-level "being built" look instead (`groundWorkUp`): stakes, a rope line and chalk marks round its outline,
 * then planks, a sawhorse, a spade, a pail and a mallet laid out round it, more of them as the project fills (Misa,
 * 2026-11-11). Drawn in code like the scaffold, so no art-studio sprite is involved. `scaffoldFor` picks by place.
 */
import { PixelGrid } from '../games/art/pixel';
import type { SpriteDef } from '../sprites/sprite-data';
import { glowSprite, type MapName } from './valley-places';

/** The steps the scaffolding goes up in: a twelfth of the art's height each. */
export const SCAFFOLD_STEPS = 12;

const PALETTE = {
  k: '#0d0a1a',
  w: '#e6c98c',
  p: '#b08850',
  q: '#7a5636',
  c: '#f4eedc',
  r: '#c9a66b',
  g: '#9aa3ad',
};

/** The steps a project's fill (0 to 1) is worth: none at nothing, at least one once something is given, and never the last (the level is raised then). */
export function scaffoldSteps(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(SCAFFOLD_STEPS - 1, Math.max(1, Math.round(fraction * SCAFFOLD_STEPS)));
}

/** The box of the art's pixels: the rows and columns where something is drawn. */
function boundsOf(sprite: SpriteDef): { top: number; bottom: number; left: number; right: number } {
  let top = sprite.rows.length;
  let bottom = -1;
  let left = Number.POSITIVE_INFINITY;
  let right = -1;
  for (const [y, row] of sprite.rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch === '.') continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { top, bottom, left, right };
}

const cache = new WeakMap<SpriteDef, Map<number, SpriteDef>>();

/**
 * Scaffolding of the same size as `sprite`, `steps` twelfths of its drawn height tall, standing on its lowest drawn row: three poles,
 * a board across them every 12 rows and one brace. Nothing (an empty sprite) at no steps.
 */
export function scaffoldUp(sprite: SpriteDef, steps: number): SpriteDef {
  const width = sprite.rows[0]?.length ?? 0;
  const height = sprite.rows.length;
  const byArt = cache.get(sprite) ?? new Map<number, SpriteDef>();
  cache.set(sprite, byArt);
  const hit = byArt.get(steps);
  if (hit !== undefined) return hit;
  const grid = new PixelGrid(width, height);
  const { top, bottom, left, right } = boundsOf(sprite);
  if (steps > 0 && right >= 0) {
    const tall = Math.max(6, Math.round(((bottom - top + 1) * steps) / SCAFFOLD_STEPS));
    const base = bottom + 1;
    const high = Math.max(0, base - tall);
    const span = right - left;
    const poles = [left + 1, left + Math.floor(span / 2), right - 4];
    // Each pole is four pixels wide with an ink edge and a pale face, so it reads as new timber against the building's own wood.
    for (const x of poles) {
      grid.rect(x, high, 4, base - high, 'k');
      grid.rect(x + 1, high, 2, base - high, 'w');
    }
    // A board across the poles every 12 rows, ink above and below.
    const boards: number[] = [];
    for (let y = base - 6; y >= high + 1; y -= 12) {
      boards.push(y);
      grid.rect(left, y, span + 1, 5, 'k');
      grid.rect(left + 1, y + 1, span - 1, 2, 'w');
      grid.rect(left + 1, y + 3, span - 1, 1, 'p');
    }
    // A brace in each bay between two boards (and the ground), from one pole to the next.
    let floor = base;
    for (const y of boards) {
      for (let n = 0; n + 1 < poles.length; n++) {
        const from = (poles[n] ?? left) + 4;
        const to = poles[n + 1] ?? right;
        const rise = Math.min(floor - y - 6, 10);
        for (let i = 0; i < to - from && rise > 0; i++) {
          grid.set(from + i, floor - 2 - Math.round((i * rise) / Math.max(1, to - from)), 'q');
        }
      }
      floor = y;
    }
  }
  const used = new Set(grid.rows().join(''));
  const palette = Object.fromEntries(Object.entries(PALETTE).filter(([k]) => used.has(k)));
  const out: SpriteDef = { rows: grid.rows(), palette };
  byArt.set(steps, out);
  return out;
}

/** The places that lie flat on the ground: no tall scaffold, the ground-level work look instead. */
export const FLAT_PLACES: ReadonlySet<MapName> = new Set<MapName>([
  'bonfire',
  'bonfire-grand',
  'paddock',
  'road',
]);

/** The scaffolding of `name`'s art at `steps`: the tall poles for a building, the ground-level work for a flat place. */
export function scaffoldFor(name: MapName, steps: number): SpriteDef {
  const art = glowSprite(name);
  return FLAT_PLACES.has(name) ? groundWorkUp(art, steps) : scaffoldUp(art, steps);
}

/** A sawhorse with a plank across it, 16 wide and 9 tall. */
const SAWHORSE = [
  'kkkkkkkkkkkkkkkk',
  'kwwwwwwwwwwwwwwk',
  'kppppppppppppppk',
  '.kqk........kqk.',
  '.kqk........kqk.',
  '.kqk........kqk.',
  '.kqk........kqk.',
  'kkqkk......kkqkk',
  'kk.kk......kk.kk',
];
/** A spade stuck in the ground, 5 wide and 12 tall. */
const SHOVEL = [
  '.kkk.',
  '.kqk.',
  '.kqk.',
  '.kqk.',
  '.kqk.',
  '.kqk.',
  '.kqk.',
  '.kqk.',
  'kkgkk',
  'kgggk',
  'kgggk',
  '.kgk.',
];
/** A pail, 7 wide and 7 tall. */
const BUCKET = ['kkkkkkk', 'kgcgggk', '.kgggk.', '.kgggk.', '.kgggk.', '.kgggk.', '..kkk..'];
/** A mallet lying down, 10 wide and 6 tall. */
const MALLET = ['kkkk......', 'kqqk......', 'kqqkkkkkkk', 'kqqkwwwwwk', 'kqqkkkkkkk', 'kkkk......'];

/** A stake driven into the ground: 3 wide, `h` tall, ink edges with a pale face and a darker cap; its foot is on row `base`. */
function stake(grid: PixelGrid, x: number, base: number, h = 8): void {
  grid.rect(x, base - h + 1, 3, h, 'k');
  grid.rect(x + 1, base - h + 2, 1, h - 3, 'w');
  grid.set(x + 1, base - h + 1, 'p');
}

/** A stack of `n` planks, 14 wide, its bottom on row `base`. */
function planks(grid: PixelGrid, x: number, base: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = base - 3 - i * 3;
    grid.rect(x + (i % 2), y, 14, 4, 'k');
    grid.rect(x + 1 + (i % 2), y + 1, 12, 2, 'w');
    grid.rect(x + 1 + (i % 2), y + 2, 12, 1, 'p');
  }
}

/** A rope pulled between two points on one row, with a sag shadow under every other pixel. */
function rope(grid: PixelGrid, from: number, to: number, y: number): void {
  for (let x = from; x <= to; x++) {
    grid.set(x, y, 'r');
    if (x % 2 === 0) grid.set(x, y + 1, 'q');
  }
}

const groundCache = new WeakMap<SpriteDef, Map<number, SpriteDef>>();

/**
 * Ground-level work round a flat place's art, of the same size as `sprite`, lying along its lowest drawn row: one step
 * adds the two front stakes and the rope between them, and each later step more (chalk marks, the back stakes, the rope
 * round the outline, planks, a spade, a sawhorse, a pail, a mallet, a taller stack, the middle stakes). Nothing at no steps.
 */
export function groundWorkUp(sprite: SpriteDef, steps: number): SpriteDef {
  const width = sprite.rows[0]?.length ?? 0;
  const height = sprite.rows.length;
  const byArt = groundCache.get(sprite) ?? new Map<number, SpriteDef>();
  groundCache.set(sprite, byArt);
  const hit = byArt.get(steps);
  if (hit !== undefined) return hit;
  const grid = new PixelGrid(width, height);
  const { bottom, left, right } = boundsOf(sprite);
  if (steps > 0 && right >= 0) {
    const floor = bottom;
    const middle = Math.floor((left + right) / 2);
    const fl = left + 1;
    const fr = right - 3;
    const back = floor - 10;
    const frontTop = floor - 6;
    const backTop = back - 6;
    // The rope and the chalk go down first, the stakes and tools over them.
    rope(grid, fl + 1, fr + 1, frontTop);
    if (steps >= 2) for (let x = fl + 4; x < fr - 1; x += 3) grid.set(x, floor, 'c');
    if (steps >= 4) {
      rope(grid, fl + 1, fr + 1, backTop);
      for (let y = backTop; y <= frontTop; y += 2) {
        grid.set(fl + 1, y, 'r');
        grid.set(fr + 1, y, 'r');
      }
    }
    if (steps >= 3) {
      stake(grid, fl, back);
      stake(grid, fr, back);
    }
    if (steps >= 11) {
      stake(grid, middle - 1, floor);
      stake(grid, middle - 1, back);
    }
    stake(grid, fl, floor);
    stake(grid, fr, floor);
    if (steps >= 5) planks(grid, left + 6, floor, steps >= 10 ? 4 : 2);
    if (steps >= 6) grid.stamp(SHOVEL, right - 11, floor - SHOVEL.length + 1);
    if (steps >= 7) grid.stamp(SAWHORSE, middle - 8, floor - SAWHORSE.length + 1);
    if (steps >= 8) grid.stamp(BUCKET, right - 12, back - BUCKET.length + 1);
    if (steps >= 9) grid.stamp(MALLET, left + 6, back - MALLET.length + 1);
  }
  const used = new Set(grid.rows().join(''));
  const palette = Object.fromEntries(Object.entries(PALETTE).filter(([k]) => used.has(k)));
  const out: SpriteDef = { rows: grid.rows(), palette };
  byArt.set(steps, out);
  return out;
}
