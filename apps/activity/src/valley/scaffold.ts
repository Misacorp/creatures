/**
 * The scaffolding that rises round a place while its project fills (V-COM-6): plain wooden poles and boards standing in front of the
 * place's own art, from the ground up, as high as the project is full. Pixel-exact (it is a sprite the same size as the art, drawn at
 * the scene's scale like everything else); nothing here draws a number or a name. Pure.
 */
import { PixelGrid } from '../games/art/pixel';
import type { SpriteDef } from '../sprites/sprite-data';

/** The steps the scaffolding goes up in: a twelfth of the art's height each. */
export const SCAFFOLD_STEPS = 12;

const PALETTE = { k: '#0d0a1a', w: '#e6c98c', p: '#b08850', q: '#7a5636' };

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
