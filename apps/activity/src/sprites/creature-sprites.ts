/**
 * Sprite lookups for creatures (16x16) and bosses (24x24), and for the daily dungeon's foes (16x16)
 * and room bosses (24x24). The pixel data lives in `data/`; every
 * species and boss has a sprite, drawn from its visual brief (`docs/design/creatures.md`). Symmetric
 * sprites store only their left half and set `mirror`. An id without a sprite (for example a species
 * added to the content before its art) falls back to `FALLBACK_SILHOUETTE`. Guests use the sprite of
 * their species.
 */
import { BOSS_SPRITE_DATA } from './data/boss-sprites';
import { DUNGEON_BOSS_SPRITE_DATA } from './data/dungeon-boss-sprites';
import { DUNGEON_FOE_SPRITE_DATA } from './data/dungeon-sprites';
import { SPECIES_SPRITE_DATA } from './data/species-sprites';
import type { SpriteDef } from './sprite-data';

export const CREATURE_SIZE = { width: 16, height: 16 } as const;
export const BOSS_SIZE = { width: 24, height: 24 } as const;

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

const SPECIES_SPRITES = SPECIES_SPRITE_DATA;
const BOSS_SPRITES = BOSS_SPRITE_DATA;
const DUNGEON_FOE_SPRITES = DUNGEON_FOE_SPRITE_DATA;
const DUNGEON_BOSS_SPRITES = DUNGEON_BOSS_SPRITE_DATA;

/** The sprite for a species id, or undefined when none has been drawn. */
export function creatureSprite(speciesId: string): SpriteDef | undefined {
  return Object.hasOwn(SPECIES_SPRITES, speciesId) ? SPECIES_SPRITES[speciesId] : undefined;
}

/** The sprite for a species, or the silhouette. */
export function creatureSpriteOrFallback(speciesId: string): SpriteDef {
  return creatureSprite(speciesId) ?? FALLBACK_SILHOUETTE;
}

/** The sprite for a boss id, or undefined when none has been drawn. */
export function bossSprite(bossId: string): SpriteDef | undefined {
  return Object.hasOwn(BOSS_SPRITES, bossId) ? BOSS_SPRITES[bossId] : undefined;
}

/** The sprite for a daily-dungeon foe id (16x16), or undefined when none has been drawn. */
export function dungeonFoeSprite(foeId: string): SpriteDef | undefined {
  return Object.hasOwn(DUNGEON_FOE_SPRITES, foeId) ? DUNGEON_FOE_SPRITES[foeId] : undefined;
}

/** The sprite for a daily-dungeon room boss id (24x24), or undefined when none has been drawn. */
export function dungeonBossSprite(bossId: string): SpriteDef | undefined {
  return Object.hasOwn(DUNGEON_BOSS_SPRITES, bossId) ? DUNGEON_BOSS_SPRITES[bossId] : undefined;
}

export const BUNDLED_CREATURE_SPRITES: Readonly<Record<string, SpriteDef>> = SPECIES_SPRITES;
export const BUNDLED_BOSS_SPRITES: Readonly<Record<string, SpriteDef>> = BOSS_SPRITES;
export const BUNDLED_DUNGEON_FOE_SPRITES: Readonly<Record<string, SpriteDef>> = DUNGEON_FOE_SPRITES;
export const BUNDLED_DUNGEON_BOSS_SPRITES: Readonly<Record<string, SpriteDef>> =
  DUNGEON_BOSS_SPRITES;
