/**
 * The valley's places as art: the eleven buildings drawn with the art library's `valley-glow` sprites as they
 * are (concept data, not redrawn), in the valley's day light. The four newer places (the bonfire, the School,
 * the visitor's stall, the Market) are drawn but not open yet (phase 4, Q58). Pure: no clock, no randomness.
 */
import { VALLEY_GLOW_CAMP_CONCEPTS } from '../sprites/concepts/valley-glow-camp';
import { VALLEY_GLOW_CONCEPTS } from '../sprites/concepts/valley-glow';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';
import type { Placement } from '../games/art/pixel';

/** How the valley looks right now: who is at the stall, and how grown the bonfire is (always day for now). */
export interface ValleyLook {
  /** The visitor is in the valley (his stall open) rather than away (shuttered). */
  visitorHere: boolean;
  /** The bonfire's place level: 1 is the fire in its ring, 2 and up the grand hearth. */
  bonfireLevel: number;
}

export const DEFAULT_LOOK: ValleyLook = { visitorHere: true, bonfireLevel: 1 };

/** The first place level that shows the grand hearth. */
export const GRAND_LEVEL = 2;

export type GlowName =
  'bonfire' | 'bonfire-grand' | 'school' | 'visitor' | 'visitor-away' | 'market';

/** The other places' sprites: the house, Forge and cave (`valley-glow`), the rest of the camp (`valley-glow-camp`). */
export type CampName = 'house' | 'forge' | 'cave' | 'arena' | 'fairground' | 'road' | 'paddock';

/** Every glow sprite the valley map draws. */
export type MapName = GlowName | CampName;

const daySprites = new Map<MapName, SpriteDef>();

/** A glow sprite by day (the sprite's main palette is night; its `alts.day` is the recolour used here). */
export function glowSprite(name: MapName): SpriteDef {
  const cache = daySprites;
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const concept = VALLEY_GLOW_CONCEPTS.sprites[name] ?? VALLEY_GLOW_CAMP_CONCEPTS.sprites[name];
  if (concept === undefined) throw new Error(`no valley-glow sprite ${name}`);
  const day = concept.alts?.['day'];
  const sprite = day !== undefined ? swapPalette(concept.sprite, day) : concept.sprite;
  cache.set(name, sprite);
  return sprite;
}

/** Which sprite the bonfire is at a place level. */
export function bonfireName(level: number): GlowName {
  return level >= GRAND_LEVEL ? 'bonfire-grand' : 'bonfire';
}

/** Which sprite the visitor's place is. */
export function visitorName(here: boolean): GlowName {
  return here ? 'visitor' : 'visitor-away';
}

/**
 * Where each sprite's top-left stands, in valley pixels. The bonfire's and the stall's glow reaches a little
 * past their button's rectangle; each sprite is kept clear of the roads and of the next place.
 */
const SPOTS = {
  cave: { x: 24, y: 64 },
  school: { x: 122, y: 66 },
  house: { x: 208, y: 72 },
  market: { x: 322, y: 68 },
  arena: { x: 424, y: 64 },
  fairground: { x: 60, y: 200 },
  paddock: { x: 208, y: 222 },
  forge: { x: 312, y: 160 },
  bonfire: { x: 332, y: 232 },
  'bonfire-grand': { x: 328, y: 228 },
  visitor: { x: 456, y: 148 },
  'visitor-away': { x: 456, y: 148 },
  road: { x: 470, y: 226 },
} as const satisfies Record<MapName, { x: number; y: number }>;

/** A sprite's rectangle in the valley (its top-left from `SPOTS`, its size from its art). */
export function artBox(name: MapName): { x: number; y: number; width: number; height: number } {
  const sprite = glowSprite(name);
  return { ...SPOTS[name], width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}

/** The places drawn into the valley, in valley pixels. */
export function placePlacements(look: ValleyLook): Placement[] {
  const names: MapName[] = [
    'cave',
    'school',
    'house',
    'market',
    'arena',
    'fairground',
    'paddock',
    'forge',
    bonfireName(look.bonfireLevel),
    visitorName(look.visitorHere),
    'road',
  ];
  return names.map((name) => ({ sprite: glowSprite(name), ...SPOTS[name] }));
}
