import { spriteSize, type SpriteDef } from '../../sprites/sprite-data';
import { TRAIL_DASH, worldSprite } from '../../sprites/world-map-art';
import type { WorldMapSpriteName } from '../../sprites/data/world-map-sprites';
import type { Tab } from '../../tabs';

/**
 * The valley of option 2 (a dev-only mock-up): the world map's own ground, trails, small props and
 * landmarks, placed again as a home scene. A place is a landmark sprite on the ground; its button and name
 * plate are drawn over it by `Option2Valley.tsx`. There are two layouts, a tall one for a phone and a wide
 * one for a desktop map. Coordinates are in sprite pixels (the scene is drawn at a whole-number scale).
 */

export interface ValleyPlace {
  tab: Tab;
  /** The landmark standing in for the place (the world map's art, reused). */
  landmark: WorldMapSpriteName;
  /** Top-left of the landmark in the scene. */
  x: number;
  y: number;
}

export interface ValleyLayout {
  width: number;
  height: number;
  places: readonly ValleyPlace[];
  /** Small props: [name, x, y]. */
  decor: readonly (readonly [WorldMapSpriteName, number, number])[];
}

export const VALLEY_PHONE: ValleyLayout = {
  width: 172,
  height: 318,
  places: [
    { tab: 'raid', landmark: 'stormRidge', x: 104, y: 6 },
    { tab: 'dungeon', landmark: 'emberCaves', x: 8, y: 36 },
    { tab: 'games', landmark: 'festivalGrounds', x: 108, y: 90 },
    { tab: 'expeditions', landmark: 'oldCrossroads', x: 6, y: 124 },
    { tab: 'workshop', landmark: 'moonlitReef', x: 104, y: 192 },
    { tab: 'collection', landmark: 'verdantHollow', x: 10, y: 230 },
  ],
  decor: [
    ['smallPine', 80, 12],
    ['bush', 70, 70],
    ['flowers', 84, 150],
    ['smallTree', 82, 232],
    ['bush', 150, 160],
    ['flowers', 60, 108],
    ['smallPine', 4, 4],
    ['bush', 100, 288],
    ['flowers', 40, 300],
    ['smallTree', 150, 258],
  ],
};

export const VALLEY_WIDE: ValleyLayout = {
  width: 320,
  height: 292,
  places: [
    { tab: 'collection', landmark: 'verdantHollow', x: 14, y: 130 },
    { tab: 'dungeon', landmark: 'emberCaves', x: 40, y: 14 },
    { tab: 'raid', landmark: 'stormRidge', x: 224, y: 10 },
    { tab: 'games', landmark: 'festivalGrounds', x: 252, y: 130 },
    { tab: 'workshop', landmark: 'moonlitReef', x: 200, y: 216 },
    { tab: 'expeditions', landmark: 'oldCrossroads', x: 122, y: 108 },
  ],
  decor: [
    ['smallPine', 120, 10],
    ['bush', 100, 70],
    ['flowers', 210, 90],
    ['smallTree', 20, 214],
    ['bush', 150, 250],
    ['flowers', 70, 90],
    ['smallPine', 300, 4],
    ['bush', 290, 250],
    ['flowers', 170, 50],
    ['smallTree', 110, 200],
    ['smallPine', 60, 262],
    ['flowers', 240, 70],
    ['smallTree', 300, 210],
  ],
};

export interface ScenePiece {
  sprite: SpriteDef;
  x: number;
  y: number;
}

/** The size of a place's landmark. */
export function placeSize(place: ValleyPlace): { width: number; height: number } {
  return spriteSize(worldSprite(place.landmark));
}

/** Where a place's trail starts and ends: the middle of the landmark's foot. */
function foot(place: ValleyPlace): { x: number; y: number } {
  const s = placeSize(place);
  return { x: place.x + Math.round(s.width / 2), y: place.y + s.height - 2 };
}

/** Every piece of the scene in draw order: ground, trails between neighbours, props, landmarks. */
export function valleyPieces(layout: ValleyLayout): ScenePiece[] {
  const out: ScenePiece[] = [];
  const grass = worldSprite('grass');
  for (let y = 0; y < layout.height; y += 16) {
    for (let x = 0; x < layout.width; x += 16) out.push({ sprite: grass, x, y });
  }
  // Trails: each place to the next in the list, plain straight dashes (2 px apart, 6 px steps).
  const feet = layout.places.map(foot);
  for (let i = 0; i + 1 < feet.length; i++) {
    const a = feet[i];
    const b = feet[i + 1];
    if (a === undefined || b === undefined) continue;
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let s = 1; s < steps; s++) {
      out.push({
        sprite: TRAIL_DASH,
        x: Math.round(a.x + ((b.x - a.x) * s) / steps),
        y: Math.round(a.y + ((b.y - a.y) * s) / steps),
      });
    }
  }
  for (const [name, x, y] of layout.decor) out.push({ sprite: worldSprite(name), x, y });
  const byDepth = [...layout.places].sort((p, q) => p.y - q.y);
  for (const place of byDepth)
    out.push({ sprite: worldSprite(place.landmark), x: place.x, y: place.y });
  return out;
}
