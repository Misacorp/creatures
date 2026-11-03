/**
 * The ground of the four newer places' scenes (the bonfire, the School, the visitor's stall, the Market), as
 * placements for `SceneFrame`: grass to every edge, the place's poster (`valley-posters`) framed at the head
 * of the screen, and the place itself (its `valley-glow` sprite) standing beneath it in the same light as the
 * valley. The spots say where things stand, so scenes put their buttons and creatures on the same places.
 */
import { VALLEY_POSTERS_CONCEPTS } from '../../sprites/concepts/valley-posters';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import type { SpriteDef } from '../../sprites/sprite-data';
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { tileFrame } from '../../games/art/tiles';
import type { SceneGeometry } from './SceneFrame';
import type { Waiting } from '../welcome/PlaceStories';
import type { ProtoWorld } from '../world';
import { TILE, type Placement } from './valley-art';
import {
  bonfireName,
  dimmed,
  glowSprite,
  visitorName,
  type GlowName,
  type Time,
  type ValleyLook,
} from './valley-places';

const INK = '#0d0a1a';

/** The poster of a place state (64 x 24 pixels). */
export function posterSprite(name: GlowName): SpriteDef {
  const found = VALLEY_POSTERS_CONCEPTS.sprites[name];
  if (found === undefined) throw new Error(`no valley-posters banner ${name}`);
  return found.sprite;
}

/** What each of these scenes takes: the world, the way out, the stories a marker led in with, the valley's look. */
export interface PlaceSceneProps {
  world: ProtoWorld;
  onLeave: () => void;
  waiting?: Waiting | undefined;
  look?: ValleyLook | undefined;
}

/** The sprite (and poster) name of a place in its state. */
export function glowNameOf(
  place: 'bonfire' | 'school' | 'visitor' | 'market',
  state: { bonfireLevel?: number; visitorHere?: boolean } = {},
): GlowName {
  switch (place) {
    case 'bonfire':
      return bonfireName(state.bonfireLevel ?? 1);
    case 'visitor':
      return visitorName(state.visitorHere ?? true);
    case 'school':
      return 'school';
    case 'market':
      return 'market';
  }
}

/** Where things stand in these scenes (scene pixels): the poster's and the place's top-left, the row beneath. */
export function glowSceneSpots(g: SceneGeometry) {
  return {
    poster: { x: g.cx - 32, y: g.top + 6 },
    place: { x: g.cx - 30, y: g.top + 44 },
    /** The row just below the place's sprite (a sign or a creature stands here). */
    below: g.top + 44 + 50,
  };
}

/** The scene: grass everywhere, the framed poster at the head, the place beneath, a few trees and flowers. */
export function glowSceneDraw(spec: { name: GlowName; time: Time }) {
  const { name, time } = spec;
  const shade = (sprite: SpriteDef): SpriteDef => (time === 'night' ? dimmed(sprite) : sprite);
  return (g: SceneGeometry): Placement[] => {
    const at = glowSceneSpots(g);
    const grass = shade(tileFrame('grass'));
    const out: Placement[] = [];
    for (let y = 0; y < g.H; y += TILE) {
      for (let x = 0; x < g.W; x += TILE) out.push({ sprite: grass, x, y });
    }
    const wm = WORLD_MAP_SPRITE_DATA;
    out.push(
      { sprite: shade(wm.smallPine), x: g.cx - 62, y: at.place.y - 6 },
      { sprite: shade(wm.bush), x: g.cx - 50, y: at.below - 14 },
      { sprite: shade(wm.smallTree), x: g.cx + 48, y: at.place.y - 2 },
      { sprite: shade(wm.flowers), x: g.cx + 40, y: at.below - 10 },
    );
    // The poster, in an ink frame.
    const frame = new PixelGrid(68, 28);
    frame.rect(0, 0, 68, 28, 'k');
    out.push(...gridPlacements(frame, { k: INK }, at.poster.x - 2, at.poster.y - 2));
    out.push({ sprite: posterSprite(name), ...at.poster });
    out.push({ sprite: glowSprite(name, time), ...at.place });
    return out;
  };
}
