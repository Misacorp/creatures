/**
 * Comparing pieces (`docs/design/housing-workshop.md`): the pixel difference between two sprites by colour (the
 * palette keys may differ), and a short hash of a finished piece for the shipped-art lock.
 */
import type { PieceArt } from '../../housing/house-art';
import { expandRows, type SpriteDef } from '../sprite-data';

/** The colour of every pixel, row by row (`''` transparent). */
export function colours(def: SpriteDef): string[][] {
  return expandRows(def).map((row) =>
    [...row].map((ch) => (ch === '.' ? '' : (def.palette[ch] ?? '?').toLowerCase())),
  );
}

/**
 * How many pixels of two sprites differ in colour (or in being drawn), over the area of both. Sprites of different
 * sizes are compared from their top left.
 */
export function pixelDiff(a: SpriteDef, b: SpriteDef): { differ: number; area: number } {
  const ca = colours(a);
  const cb = colours(b);
  const h = Math.max(ca.length, cb.length);
  const w = Math.max(ca[0]?.length ?? 0, cb[0]?.length ?? 0);
  let differ = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if ((ca[y]?.[x] ?? '') !== (cb[y]?.[x] ?? '')) differ++;
  }
  return { differ, area: w * h };
}

/** FNV-1a, 32 bits, as 8 hex digits. */
export function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const layer = (def: SpriteDef | undefined): string =>
  def === undefined
    ? '-'
    : colours(def)
        .map((row) => row.join(','))
        .join('/');

/** A hash of one sprite's colours (not its key names). */
export function spriteHash(def: SpriteDef): string {
  return fnv(layer(def));
}

/** The light flag of a piece as text: its kind, or its kind, where it burns and its size. */
function lightText(light: PieceArt['light']): string {
  if (light === undefined) return '-';
  if (typeof light === 'string') return light;
  const at = light.at === undefined ? '' : `@${String(light.at.x)},${String(light.at.y)}`;
  const size = light.size === undefined ? '' : `x${String(light.size)}`;
  return `${light.kind}${at}${size}`;
}

/**
 * A hash of what a piece looks like and how it lights: every layer's colours, the sleep anchor and its `light` flag (not the key
 * names).
 */
export function pieceHash(art: PieceArt): string {
  return fnv(
    [
      layer(art.sprite),
      layer(art.front),
      layer(art.glow),
      art.sleep === undefined ? '-' : `${String(art.sleep.x)},${String(art.sleep.y)}`,
      lightText(art.light),
    ].join('|'),
  );
}
