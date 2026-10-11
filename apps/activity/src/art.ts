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
  splashet: { b: '#c63fd6', h: '#f9e8ff', s: '#8a1f8b', p: '#b8f4ca' },
  tidewing: { b: '#c63fd6', h: '#f9e8ff', s: '#8a1f8b', p: '#b8f4ca', f: '#dd7ff0' },
  cindle: {
    b: '#2a7be8',
    h: '#4a83ff',
    s: '#1f63a8',
    p: '#b0b7f6',
    a: '#4756ff',
    f: '#9180ff',
    m: '#2a4e5a',
  },
  pyrelynx: {
    b: '#2a7be8',
    h: '#4a83ff',
    s: '#1f63a8',
    p: '#b0b7f6',
    a: '#4756ff',
    f: '#9180ff',
    m: '#2a4e5a',
  },
  sproutle: { b: '#b0a34a', h: '#e2a26a', s: '#5b6b2f', p: '#f4cfd4' },
  thornbuck: { b: '#b0a34a', h: '#e2a26a', s: '#5b6b2f', p: '#f4cfd4', t: '#6b2e4a' },
  zipmouse: { b: '#f22bc0', h: '#ffa0e3', s: '#c214a1', p: '#ffcff4', v: '#5bd694', t: '#f22bc0' },
  voltaro: {
    b: '#f22bc0',
    h: '#ffa0e3',
    s: '#c214a1',
    p: '#ffcff4',
    v: '#5bd694',
    t: '#f22bc0',
    a: '#ffa0e3',
  },
  mistnewt: { b: '#926fb8', h: '#bfa8e0', s: '#693f8f', p: '#d2a9d6', w: '#f9e8ff' },
  fogwyrm: { b: '#926fb8', s: '#693f8f', p: '#d2a9d6', w: '#f9e8ff' },
  ashmole: { b: '#3a4f8a', h: '#5068b0', a: '#3d71ff', o: '#a0d7f2', c: '#d9d8f4' },
  magmole: { p: '#5066b0', a: '#2a78ff', y: '#413dff', o: '#a0d7f2' },
  stormray: { b: '#f22bc0', h: '#ffa0e3', p: '#ffcff4', v: '#5bd694', t: '#f22bc0' },
  tempestray: {
    b: '#f22bc0',
    h: '#ffa0e3',
    p: '#ffcff4',
    v: '#5bd694',
    c: '#9af0c4',
    t: '#f22bc0',
  },
  mossback: { b: '#b0a34a', h: '#e2a26a', s: '#5b6b2f', p: '#d69e8a', u: '#8b435d', f: '#df8ff0' },
  ancientshell: {
    b: '#959a48',
    s: '#5b6b2f',
    p: '#d69e8a',
    u: '#8b435d',
    f: '#df8ff0',
    g: '#e2a26a',
  },
  coralynx: { b: '#702a9f', h: '#a76fd0', s: '#63176b', p: '#f9e8ff', f: '#bfff7f' },
  solmane: { b: '#2a5ff2', h: '#4133ff', s: '#2274c2', p: '#c7c2ff', a: '#4133ff' },
  gaiadrake: { p: '#e8baa0', b: '#b0a34a', s: '#5b6b2f', t: '#8a4a65', r: '#4ad88b', m: '#5b6b2f' },
  aurorix: { b: '#6df0b6', h: '#a4ffd6', y: '#ff5ed7', n: '#ebf07a' },
  lanternfin: { b: '#d03bcd', h: '#ee8ced', y: '#7aff9b', r: '#82e04a', f: '#ee8ced' },
  hearthshell: {
    b: '#2c60b5',
    h: '#3c69d4',
    s: '#22486b',
    p: '#b8b9e9',
    a: '#2a58ff',
    f: '#5b4dff',
    t: '#2e3b6b',
  },
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
