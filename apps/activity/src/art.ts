/**
 * Small lookups that sit between the sprite data and the screens: the boss sprite with a fallback,
 * the shiny palette of a species, and the class that gives an element its colour.
 */
import { FALLBACK_SILHOUETTE, bossSprite } from './sprites/creature-sprites';
import type { SpriteDef } from './sprites/sprite-data';

/** Screen pixels per sprite pixel for a boss (24x24) and for the plain fallback (16x16). */
export const BOSS_SCALE = 4;
export const FALLBACK_BOSS_SCALE = 6;

/** The boss sprite and the scale to draw it at; a bigger silhouette while a boss has no art yet. */
export function bossArt(bossId: string): { sprite: SpriteDef; scale: number } {
  const sprite = bossSprite(bossId);
  return sprite === undefined
    ? { sprite: FALLBACK_SILHOUETTE, scale: FALLBACK_BOSS_SCALE }
    : { sprite, scale: BOSS_SCALE };
}

/**
 * Palette swaps for shiny creatures, by species id (the keys are the sprite's own palette keys, see
 * `creature-sprites.ts`). A species without an entry shows a sparkle frame instead.
 */
export const SHINY_PALETTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};

export function shinyPalette(speciesId: string): Readonly<Record<string, string>> | undefined {
  return Object.hasOwn(SHINY_PALETTES, speciesId) ? SHINY_PALETTES[speciesId] : undefined;
}

/** `el-tide` and so on: sets `--el` to the element's colour (see styles.css). Unknown: no class. */
export function elementClass(element: string | null): string {
  return element !== null && /^[a-z-]+$/.test(element) ? `el-${element}` : '';
}

/** The element colours of the stylesheet (`--tide` and so on), for sprites that are recoloured. */
export const ELEMENT_COLOURS: Readonly<Record<string, string>> = {
  tide: '#4f8fe6',
  ember: '#ef6a3a',
  grove: '#5cbf5a',
  spark: '#f2d43d',
};

const MARK_PALETTES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  Object.fromEntries(Object.entries(ELEMENT_COLOURS).map(([id, colour]) => [id, { m: colour }]));

/** The palette that turns the mark glyph into the element's colour (the same object every time). */
export function markPalette(element: string): Readonly<Record<string, string>> | undefined {
  return Object.hasOwn(MARK_PALETTES, element) ? MARK_PALETTES[element] : undefined;
}
