/**
 * The props that stand in a place's scene (the fence's front rails, the feed box and trough, the arena's front rim,
 * the fairground's posts) drawn in the same depth order as the creatures: by their bottom edge, so a creature
 * standing in front of a prop is drawn over it and one standing behind it is drawn under it
 * (`ux-patterns.md`, "Creatures in a scene stand by their feet"). The place's art is one picture on the scene's
 * canvas, under every creature; each prop is cut out of that picture here as a sprite of its own (the ground and
 * the ground's shadow stay in the canvas) and drawn in the creatures' layer. Pure.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { CREATURE_PX } from './place-cast';
import { glowSprite, type MapName } from './valley-places';
import { depthOf } from './valley-logic';

/** A prop's box in its place's art (art pixels) and the palette keys left out of it (ground, dither, ground shadow). */
export interface PropSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Palette keys that stay in the canvas: they are the ground, not the prop. */
  ground: string;
}

/** The ground's palette keys in each place's art: grass dither, dirt, sand, pebbles, flowers and the green shadows. */
const PADDOCK_GROUND = '123pjx';
const ARENA_GROUND = '123abBjy';
const FAIR_GROUND = '123pxij';

/**
 * Each place's props, by their art. A prop's bottom edge (`y + height`) is where a creature's feet are level with
 * it. The arena's rim is cut in bands so a creature on the sand is behind only the part of the rim in front of it.
 */
export const PROPS: Readonly<Partial<Record<MapName, readonly PropSpec[]>>> = {
  paddock: [
    // The back rail, the two side posts, the hay, the trough, and the two front rails (the gate post goes with the right one).
    { x: 6, y: 3, width: 52, height: 11, ground: PADDOCK_GROUND },
    { x: 2, y: 14, width: 9, height: 12, ground: PADDOCK_GROUND },
    { x: 52, y: 14, width: 10, height: 12, ground: PADDOCK_GROUND },
    { x: 13, y: 15, width: 14, height: 9, ground: PADDOCK_GROUND },
    { x: 36, y: 16, width: 15, height: 9, ground: PADDOCK_GROUND },
    { x: 1, y: 26, width: 20, height: 11, ground: PADDOCK_GROUND },
    { x: 43, y: 26, width: 21, height: 11, ground: PADDOCK_GROUND },
  ],
  arena: [
    { x: 6, y: 34, width: 52, height: 4, ground: ARENA_GROUND },
    { x: 8, y: 38, width: 48, height: 4, ground: ARENA_GROUND },
    { x: 10, y: 42, width: 44, height: 5, ground: ARENA_GROUND },
  ],
  fairground: [
    { x: 5, y: 19, width: 6, height: 24, ground: FAIR_GROUND },
    { x: 53, y: 19, width: 7, height: 24, ground: FAIR_GROUND },
  ],
};

/** A prop cut out of its place's art: its sprite, where it stands in the art and its bottom edge (art pixels). */
export interface Prop {
  sprite: SpriteDef;
  x: number;
  y: number;
  /** The row under its last row: where a creature's feet are level with it. */
  bottom: number;
}

const cache = new Map<MapName, Prop[]>();

/** The props of a place, cut from its day sprite (empty for a place without any). */
export function frontProps(name: MapName): Prop[] {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const art = glowSprite(name);
  const out = (PROPS[name] ?? []).map((spec): Prop => {
    const rows = art.rows.slice(spec.y, spec.y + spec.height).map((row) =>
      [...row.slice(spec.x, spec.x + spec.width)]
        .map((key) => (spec.ground.includes(key) ? '.' : key))
        .join('')
        .padEnd(spec.width, '.'),
    );
    return {
      sprite: { palette: art.palette, rows },
      x: spec.x,
      y: spec.y,
      bottom: spec.y + spec.height,
    };
  });
  cache.set(name, out);
  return out;
}

/**
 * The draw order of a prop whose art's top-left is at (`artX`, `artY`) in the scene: that of a creature whose
 * feet are on the prop's bottom edge (`depthOf` takes the creature's top-left, a sprite above its feet).
 */
export function propDepth(artX: number, artY: number, prop: Prop): number {
  return depthOf(artX + prop.x, artY + prop.bottom - CREATURE_PX);
}
