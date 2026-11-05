/**
 * The valley's four newer places as art (prototype, dev only): the bonfire, the School, the visitor's stall and
 * the Market, drawn with the art library's `valley-glow` sprites as they are (concept data, not redrawn), and
 * the look of the valley's light: day by default, night when asked. Night is the sprites' own main palette; the
 * rest of the valley is dimmed and cooled (`dimmed`) so the glow sits on it. Pure: no clock, no randomness.
 */
import { VALLEY_GLOW_CAMP_CONCEPTS } from '../../sprites/concepts/valley-glow-camp';
import { VALLEY_GLOW_CONCEPTS } from '../../sprites/concepts/valley-glow';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import type { Placement } from '../../games/art/pixel';

export type Time = 'day' | 'night';

/** How the valley looks right now: the light, who is at the stall, and how grown the bonfire is. */
export interface ValleyLook {
  time: Time;
  /** The visitor is in the valley (his stall open) rather than away (shuttered). */
  visitorHere: boolean;
  /** The bonfire's place level: 1 is the fire in its ring, 2 and up the grand hearth. */
  bonfireLevel: number;
}

export const DEFAULT_LOOK: ValleyLook = { time: 'day', visitorHere: true, bonfireLevel: 1 };

/** The first place level that shows the grand hearth. */
export const GRAND_LEVEL = 2;

export type GlowName =
  'bonfire' | 'bonfire-grand' | 'school' | 'visitor' | 'visitor-away' | 'market';

/** The other places' sprites: the house, Forge and cave (`valley-glow`), the rest of the camp (`valley-glow-camp`). */
export type CampName = 'house' | 'forge' | 'cave' | 'arena' | 'fairground' | 'road' | 'paddock';

/** Every glow sprite the valley map draws. */
export type MapName = GlowName | CampName;

const daySprites = new Map<MapName, SpriteDef>();
const nightSprites = new Map<MapName, SpriteDef>();

/** A glow sprite in the light asked for (night is its main palette, day its `alts.day` recolour). */
export function glowSprite(name: MapName, time: Time): SpriteDef {
  const cache = time === 'day' ? daySprites : nightSprites;
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const concept = VALLEY_GLOW_CONCEPTS.sprites[name] ?? VALLEY_GLOW_CAMP_CONCEPTS.sprites[name];
  if (concept === undefined) throw new Error(`no valley-glow sprite ${name}`);
  const day = concept.alts?.['day'];
  const sprite =
    time === 'day' && day !== undefined ? swapPalette(concept.sprite, day) : concept.sprite;
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
  const sprite = glowSprite(name, 'day');
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
  return names.map((name) => ({ sprite: glowSprite(name, look.time), ...SPOTS[name] }));
}

// --- Night ---

const hex = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

/** `#rgb` or `#rrggbb` as three numbers. */
function rgb(colour: string): [number, number, number] {
  const full =
    colour.length === 4
      ? `#${colour[1] ?? '0'}${colour[1] ?? '0'}${colour[2] ?? '0'}${colour[2] ?? '0'}${colour[3] ?? '0'}${colour[3] ?? '0'}`
      : colour;
  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16),
  ];
}

/** A colour at night: darker, and cooler (red and green fall further than blue). */
export function nightColour(colour: string): string {
  const [r, g, b] = rgb(colour);
  return `#${hex(r * 0.4 + 6)}${hex(g * 0.46 + 8)}${hex(b * 0.74 + 22)}`;
}

const dimCache = new WeakMap<SpriteDef, SpriteDef>();

/** A sprite as it looks at night (cached, so the canvas parses each once). */
export function dimmed(sprite: SpriteDef): SpriteDef {
  let hit = dimCache.get(sprite);
  if (hit === undefined) {
    const palette: Record<string, string> = {};
    for (const [key, colour] of Object.entries(sprite.palette)) palette[key] = nightColour(colour);
    hit = { ...sprite, palette };
    dimCache.set(sprite, hit);
  }
  return hit;
}
