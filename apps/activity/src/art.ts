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
 * `creature-sprites.ts`). Each element has one hue shift (Tide to magenta, Ember to blue, Grove to
 * gold, Spark to pink and green) applied to every colour of the sprite except the outline, the eye
 * highlight and near-neutral colours. A species without an entry shows a sparkle frame instead.
 */
export const SHINY_PALETTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  splashet: { b: '#c63fd6', d: '#8a1f8b', w: '#f9e8ff', s: '#b8f4ca' },
  tidewing: { h: '#dd7ff0', b: '#c63fd6', d: '#8a1f8b', w: '#f9e8ff', s: '#b8f4ca' },
  cindle: { o: '#2a9ae8', g: '#4774ff', c: '#b0c2f6', p: '#2a565a' },
  pyrelynx: { o: '#1f8fd9', g: '#3d82ff', y: '#6b7eff', c: '#b0c2f6', p: '#2a565a' },
  sproutle: { g: '#b09b4a', l: '#e2986a', m: '#606b2f', c: '#f4cfd7' },
  thornbuck: { g: '#b09b4a', l: '#e2986a', m: '#606b2f', b: '#6b2e4f', c: '#f4cfd7' },
  zipmouse: { y: '#f22bd1', f: '#ffa0eb', v: '#5bd694', n: '#2a5e3e' },
  voltaro: { y: '#f22bd1', f: '#ffa0eb', v: '#5bd694', n: '#2a5e3e', a: '#ee31ff' },
  mistnewt: { t: '#926fb8', f: '#d2a9d6', d: '#8a1f8b', w: '#f9e8ff' },
  fogwyrm: { t: '#926fb8', f: '#d2a9d6', w: '#f9e8ff', y: '#8affaf' },
  ashmole: { o: '#3d92ff', n: '#32567a', y: '#6b82ff', p: '#a0e4f2' },
  magmole: { m: '#2a9cff', y: '#3d5aff', n: '#32567a', p: '#a0e4f2' },
  stormray: { y: '#f22bd1', f: '#ffa0eb', v: '#5bd694', n: '#2a5e3e' },
  tempestray: { y: '#f22bd1', f: '#ffa0eb', v: '#5bd694', n: '#2a5e3e', l: '#9af0c4' },
  mossback: { g: '#b09b4a', l: '#e2986a', m: '#606b2f', b: '#8b4363', p: '#d78ff0', o: '#ae6e4f' },
  ancientshell: {
    g: '#b09b4a',
    l: '#e2986a',
    m: '#606b2f',
    b: '#8b4363',
    p: '#d78ff0',
    o: '#ae6e4f',
  },
  coralynx: { t: '#702a9f', d: '#63176b', p: '#bfff7f', w: '#f9e8ff' },
  solmane: { y: '#3347ff', o: '#2a81f2', r: '#2aa0d8', c: '#c2c7ff' },
  gaiadrake: { g: '#b09b4a', l: '#e2986a', m: '#606b2f', s: '#6b2e4f', r: '#4ad87f' },
  aurorix: { v: '#6df0b6', h: '#a6ffd7', y: '#ff5ee4', m: '#f0eb7a' },
  lanternfin: {
    b: '#d03bcd',
    d: '#7e1d77',
    h: '#ee8ced',
    w: '#f9e8ff',
    y: '#7aff9b',
    r: '#83e04a',
  },
  hearthshell: { t: '#2c77b5', f: '#2a7bff', y: '#4d5cff', c: '#b8c1e9', d: '#22546b' },
};

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
