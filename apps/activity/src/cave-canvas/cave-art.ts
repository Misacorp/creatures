/**
 * The Cave canvas's art (the art library's `valley-cave-canvas` set, the way the place canvases take theirs from `valley-place-props`):
 * floor, wall and mouth tiles drawn once to small images and used as CSS backgrounds at a whole-number scale, crisp. The art session's
 * pick for the mouth is variant C (a carved stone arch with a crystal keystone); it has no day palette, so its night palette is
 * used by day and by night. The CSS rock gradient (`.cave-rock`) stays under everything as the fallback where no canvas can draw
 * (tests, a failed context).
 */
import { VALLEY_CAVE_CANVAS_CONCEPTS } from '../sprites/concepts/valley-cave-canvas';
import { parseSprite, type SpriteDef } from '../sprites/sprite-data';

const SET = VALLEY_CAVE_CANVAS_CONCEPTS.sprites;

/** The sprites the scene draws (the names are the set's own). */
export type CaveArt =
  | 'cave-floor'
  | 'cave-wall-top'
  | 'cave-wall-side'
  | 'undercroft-floor'
  | 'undercroft-wall-top'
  | 'undercroft-wall-side'
  | 'cave-mouth'
  | 'campfire-prop'
  | 'cracked-stair';

/** Misa's accepted pick of the cave mouth: variant C. A one-line change here swaps it. */
export const CAVE_MOUTH_PICK = 'C';

/** A sprite of the set; the mouth is the picked variant. */
export function caveSprite(name: CaveArt): SpriteDef {
  const entry = SET[name];
  if (entry === undefined) throw new Error(`The cave set has no ${name}`);
  if (name === 'cave-mouth') {
    const variant = entry.variants?.[CAVE_MOUTH_PICK];
    if (variant === undefined) throw new Error('The cave set has no such mouth');
    return variant;
  }
  return entry.sprite;
}

/** A sprite's size in art pixels. */
export function caveSize(name: CaveArt): { width: number; height: number } {
  const def = caveSprite(name);
  const parsed = parseSprite(def);
  return { width: parsed.width, height: parsed.height };
}

const urls = new Map<string, string | null>();

/**
 * The sprite drawn at `scale` whole pixels per art pixel as an image URL for a CSS background (`image-rendering: pixelated` keeps it
 * crisp). Null where nothing can draw. Cached.
 */
export function caveUrl(name: CaveArt, scale: number): string | null {
  const key = `${name}@${String(scale)}`;
  const hit = urls.get(key);
  if (hit !== undefined) return hit;
  let url: string | null = null;
  if (typeof document !== 'undefined') {
    try {
      const parsed = parseSprite(caveSprite(name));
      const canvas = document.createElement('canvas');
      canvas.width = parsed.width * scale;
      canvas.height = parsed.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        for (const cell of parsed.cells) {
          ctx.fillStyle = cell.colour;
          ctx.fillRect(cell.x * scale, cell.y * scale, scale, scale);
        }
        const made = canvas.toDataURL();
        url = made.startsWith('data:image') ? `url("${made}")` : null;
      }
    } catch {
      url = null;
    }
  }
  urls.set(key, url);
  return url;
}

/** The CSS variables that hand the tiles to the stylesheet (`cave-canvas.css`); a tile that cannot be drawn is left out. */
export function caveVars(scale: number): Record<string, string> {
  const entries: [string, CaveArt][] = [
    ['--cave-floor', 'cave-floor'],
    ['--cave-wall-top', 'cave-wall-top'],
    ['--cave-wall-side', 'cave-wall-side'],
    ['--under-floor', 'undercroft-floor'],
    ['--under-wall-top', 'undercroft-wall-top'],
    ['--under-wall-side', 'undercroft-wall-side'],
  ];
  const out: Record<string, string> = { '--cave-s': String(scale) };
  for (const [prop, name] of entries) {
    const url = caveUrl(name, scale);
    if (url !== null) out[prop] = url;
  }
  return out;
}
