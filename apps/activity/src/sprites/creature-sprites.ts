/**
 * Sprite data for creatures (16x16) and bosses (24x24). Each entry stores the left half of the
 * sprite and mirrors it. Species without a sprite yet fall back to `FALLBACK_SILHOUETTE`.
 */
import type { SpriteDef } from './sprite-data';

export const CREATURE_SIZE = { width: 16, height: 16 } as const;
export const BOSS_SIZE = { width: 24, height: 24 } as const;

const cindle: SpriteDef = {
  mirror: true,
  palette: {
    k: '#0d0a1a',
    e: '#fbf8ec',
    q: '#ff8fab',
    r: '#ef6a3a',
    o: '#ffa83a',
    y: '#ffe680',
    d: '#a8361f',
  },
  rows: [
    '......o.',
    '.....oyo',
    '..k..oyy',
    '.krk.kor',
    '.krrkrrr',
    'krrrrrrr',
    'krrekrrr',
    'krrkkrrr',
    'krqrrrrr',
    'kdrrrrrd',
    '.kdrrrrr',
    '.kdyyyyy',
    '..kdyyyy',
    '...kdk..',
    '...kk...',
    '........',
  ],
};

const splashet: SpriteDef = {
  mirror: true,
  palette: {
    k: '#0d0a1a',
    e: '#fbf8ec',
    q: '#ff8fab',
    c: '#7fc4f5',
    w: '#e6f6ff',
    b: '#4f8fe6',
    n: '#2b4f99',
  },
  rows: [
    '........',
    '.......k',
    '......kc',
    '.....kcw',
    '....kccw',
    '...kcccc',
    '..kccccc',
    '..kcekcc',
    '.kccekcc',
    '.kcqcccc',
    '.kcccckk',
    '.kbccccc',
    '..kbbccc',
    '..knbbbb',
    '...knnnn',
    '....kkkk',
  ],
};

const sproutle: SpriteDef = {
  mirror: true,
  palette: {
    k: '#0d0a1a',
    e: '#fbf8ec',
    q: '#ff8fab',
    g: '#5cbf5a',
    l: '#a6e36c',
    m: '#2f7a3a',
    t: '#c99a62',
  },
  rows: [
    '......l.',
    '.....lgl',
    '.......m',
    '....kkkk',
    '..kkmgmg',
    '.kmgllgm',
    '.kgllgmg',
    'kmgmgmgm',
    'kkkkkkkk',
    'kttekttt',
    'kttkkttt',
    '.ktqtttt',
    '.kttttkk',
    '..ktkttt',
    '..kk.kkk',
    '........',
  ],
};

const cinderWyrm: SpriteDef = {
  mirror: true,
  palette: {
    k: '#0d0a1a',
    e: '#fbf8ec',
    r: '#ef6a3a',
    o: '#ffa83a',
    y: '#ffe680',
    d: '#a8361f',
  },
  rows: [
    '..k.........',
    '.kok........',
    '.koyk.......',
    '..koyk......',
    '...kork.kkkk',
    '....krrkrrrr',
    '...krrrrrrrr',
    '..krrrrrrrrr',
    '.krrdrrrrrrr',
    '.krdkyyrrrrr',
    '.krdkkyrrrrr',
    '.krrddrrrrrr',
    '..krrrrrrrrr',
    '..krrrrrrrrr',
    '...krrrrrkrr',
    '...krrrrrrrr',
    '....krekekek',
    '....kroooooo',
    '.....kryyyyy',
    '.....krrrrrr',
    '......kddddd',
    '.......kkkkk',
    '............',
    '............',
  ],
};

/** A plain round shape with two eyes, for species that have no sprite yet. */
export const FALLBACK_SILHOUETTE: SpriteDef = {
  mirror: true,
  palette: { k: '#0d0a1a', s: '#3d3570', e: '#a69fc8' },
  rows: [
    '........',
    '........',
    '....kkkk',
    '..kkssss',
    '.kssssss',
    '.kssssss',
    'ksssssss',
    'ksseksss',
    'ksseksss',
    'ksssssss',
    'ksssssss',
    '.kssssss',
    '..kkssss',
    '....kkkk',
    '........',
    '........',
  ],
};

const SPECIES_SPRITES: Readonly<Record<string, SpriteDef>> = { cindle, splashet, sproutle };
const BOSS_SPRITES: Readonly<Record<string, SpriteDef>> = { 'cinder-wyrm': cinderWyrm };

/** The sprite for a species, or undefined when none has been drawn yet. */
export function creatureSprite(speciesId: string): SpriteDef | undefined {
  return Object.hasOwn(SPECIES_SPRITES, speciesId) ? SPECIES_SPRITES[speciesId] : undefined;
}

/** The sprite for a species, or the silhouette. */
export function creatureSpriteOrFallback(speciesId: string): SpriteDef {
  return creatureSprite(speciesId) ?? FALLBACK_SILHOUETTE;
}

export function bossSprite(bossId: string): SpriteDef | undefined {
  return Object.hasOwn(BOSS_SPRITES, bossId) ? BOSS_SPRITES[bossId] : undefined;
}

export const BUNDLED_CREATURE_SPRITES: Readonly<Record<string, SpriteDef>> = SPECIES_SPRITES;
export const BUNDLED_BOSS_SPRITES: Readonly<Record<string, SpriteDef>> = BOSS_SPRITES;
