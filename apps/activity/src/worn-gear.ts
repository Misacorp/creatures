/**
 * What a creature looks like wearing its gear: the worn shape class of each item look and the item's
 * tint, put on the creature's sprite (`sprites/wearing.ts`). Display only; the server sends what is worn.
 */
import { gearBase } from '@creatures/game';
import { itemArt, itemLookId } from './gear-sprites';
import { creatureSprite } from './sprites/creature-sprites';
import { LOOK_CLASS, classSlot } from './sprites/data/worn-sprites';
import type { SpriteDef } from './sprites/sprite-data';
import { wearing, type WornLook } from './sprites/wearing';

/** The part of a worn item the look needs (a creature's `gear`, a room creature's, a picker's). */
export interface WornPiece {
  baseId: string;
}

const NEUTRAL_FALLBACK = { t: '#9a98ae', u: '#6a6882', h: '#d8d6e6' } as const;

/** The look of one worn item, or null for a base with no worn class (a base that is not in the content). */
export function wornLook(baseId: string): WornLook | null {
  const base = gearBase(baseId);
  if (base === undefined) return null;
  const cls = LOOK_CLASS[itemLookId(baseId)];
  if (cls === undefined) return null;
  const art = itemArt(baseId);
  const colours = { ...NEUTRAL_FALLBACK, ...art.sprite.palette, ...art.palette };
  return {
    cls,
    set: base.set !== undefined,
    colours: { t: colours.t, u: colours.u, h: colours.h },
  };
}

const CACHE = new Map<string, SpriteDef>();
/** The most outfits kept; the oldest goes first. */
export const CACHE_LIMIT = 500;
const SLOT_ORDER = ['hat', 'scarf', 'charm'] as const;

/** The outfit's key: per slot in a fixed order, the look that wins (the last piece of that slot). */
function outfitKey(species: string, looks: readonly WornLook[]): string {
  const bySlot = new Map<string, WornLook>();
  for (const look of looks) bySlot.set(classSlot(look.cls), look);
  const parts = SLOT_ORDER.map((slot) => {
    const look = bySlot.get(slot);
    return look === undefined
      ? ''
      : `${look.cls}:${look.set ? 1 : 0}:${look.colours.t}:${look.colours.u}:${look.colours.h}`;
  });
  return `${species}|${parts.join('|')}`;
}

/**
 * The sprite of a species wearing some items; the species' own sprite when it wears nothing or has no
 * sprite drawn. One object per species and resolved outfit (the order the server lists it in does not
 * matter), so a redraw gets the same object back.
 */
export function wornSprite(species: string, gear: readonly WornPiece[]): SpriteDef | undefined {
  const base = creatureSprite(species);
  if (base === undefined || gear.length === 0) return base;
  const looks = gear.flatMap((piece) => wornLook(piece.baseId) ?? []);
  if (looks.length === 0) return base;
  const key = outfitKey(species, looks);
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const result = wearing(base, looks);
  if (CACHE.size >= CACHE_LIMIT) {
    const oldest = CACHE.keys().next();
    if (oldest.done !== true) CACHE.delete(oldest.value);
  }
  CACHE.set(key, result);
  return result;
}

/** Empties the cache (for tests). */
export function clearWornCache(): void {
  CACHE.clear();
}
