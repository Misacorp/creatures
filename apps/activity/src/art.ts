/**
 * Small lookups that sit between the sprite data and the screens: the boss sprite with a fallback,
 * the shiny palette of a species, and the class that gives an element its colour.
 */
import {
  BANNER_SIZE,
  FALLBACK_SILHOUETTE,
  bannerSprite,
  bossSprite,
  dungeonBossSprite,
  dungeonFoeSprite,
} from './sprites/creature-sprites';
import { expandRows, type SpriteDef } from './sprites/sprite-data';

/**
 * Screen pixels per sprite pixel for a boss (24x24) and for a 16x16 sprite standing in the boss's
 * place (a dungeon foe, or the plain fallback), so every boss takes the same space on the stage.
 */
export const BOSS_SCALE = 4;
export const FALLBACK_BOSS_SCALE = 6;

/**
 * The sprite to draw for whatever the stage shows as its boss, and the scale to draw it at: a raid
 * boss, a daily-dungeon room boss (both 24x24), or a dungeon foe (16x16, drawn bigger); a bigger
 * silhouette while an id has no art yet.
 */
export function bossArt(bossId: string): { sprite: SpriteDef; scale: number } {
  const boss = bossSprite(bossId) ?? dungeonBossSprite(bossId);
  if (boss !== undefined) return { sprite: boss, scale: BOSS_SCALE };
  const foe = dungeonFoeSprite(bossId);
  if (foe !== undefined) return { sprite: foe, scale: FALLBACK_BOSS_SCALE };
  return { sprite: FALLBACK_SILHOUETTE, scale: FALLBACK_BOSS_SCALE };
}

/**
 * Palette swaps for shiny creatures, by species id (the keys are the sprite's own palette keys, see
 * `creature-sprites.ts`). Each element has one hue shift (Tide to magenta, Ember to blue, Grove to
 * gold, Spark to pink and green) applied to every colour of the sprite except the outline, the eye
 * highlight and near-neutral colours. A species without an entry shows a sparkle frame instead.
 */
const SHINY_PALETTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
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

/** `el-tide` and so on: sets `--el` to the element's colour (see styles/components/creature-card.css). Unknown: no class. */
export function elementClass(element: string | null): string {
  return element !== null && /^[a-z-]+$/.test(element) ? `el-${element}` : '';
}

/** The element colours of the stylesheet (`--tide` and so on), for sprites that are recoloured. */
const ELEMENT_COLOURS: Readonly<Record<string, string>> = {
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

/** A flat dusk strip for a destination whose banner has not been drawn yet. */
export const FALLBACK_BANNER: SpriteDef = {
  palette: { a: '#241e42', b: '#2f2857' },
  rows: Array.from({ length: BANNER_SIZE.height }, (_, y) =>
    (y < BANNER_SIZE.height / 2 ? 'a' : 'b').repeat(BANNER_SIZE.width),
  ),
};

/** The banner to draw for a destination: its own art, or the plain strip. */
export function bannerArt(destinationId: string): SpriteDef {
  return bannerSprite(destinationId) ?? FALLBACK_BANNER;
}

const SILHOUETTE_COLOUR = '#4a4170';

/**
 * The palette that turns a creature sprite into a flat silhouette: every colour it uses becomes one
 * dim colour, so a species that has not been found shows its shape and nothing else.
 */
export function silhouettePalette(def: SpriteDef): Readonly<Record<string, string>> {
  const keys = new Set(expandRows(def).join(''));
  keys.delete('.');
  return Object.fromEntries([...keys].map((key) => [key, SILHOUETTE_COLOUR]));
}

/**
 * The screen pixels per sprite pixel for a banner in a space `width` px wide: a whole number (the art
 * stays sharp), at least 3 and at most 6, so a banner never overflows a phone and never grows huge.
 */
export function bannerScale(width: number): number {
  return Math.min(6, Math.max(3, Math.floor(width / BANNER_SIZE.width)));
}
