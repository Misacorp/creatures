/**
 * The ground of the four newer places' scenes (the bonfire, the School, the visitor's stall, the Market), as
 * placements for `SceneFrame`: grass to every edge, the place's poster (`valley-posters`) at the head of the
 * screen, and the place itself (its `valley-glow` sprite) standing beneath it in the light of the valley.
 *
 * One pixel scale for the whole screen (`sceneScale`, `g.s`): the poster, the place, the grass, the scene's
 * creatures, the story clipping's and the tray's are all drawn at it. The place's art cannot be drawn bigger
 * than that without its pixels differing in size from the creatures', so the place's size is its art's size
 * times `g.s` (180 to 192 CSS px wide on a phone, 240 to 256 on a desktop), in a yard of grass and trees.
 *
 * For a scene: `glowLayout(g, name)` says where the art is (`art`), converts a point of the art's own pixels to
 * scene pixels (`at`), and names the spots a creature can stand at (`spots`: feet points in scene pixels, from
 * `ART_SPOTS`, which are in the art's pixels).
 */
import { VALLEY_GLOW_CONCEPTS } from '../../sprites/concepts/valley-glow';
import { VALLEY_POSTERS_CONCEPTS } from '../../sprites/concepts/valley-posters';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
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

// --- The poster's three modes (Q50: Misa chooses; all three are kept to compare on staging) ---

/** How the place's poster is shown: a sky strip edge to edge, a framed picture, or not at all. */
export type PosterMode = 'sky' | 'framed' | 'none';

/** The mode used unless the address says otherwise (`&poster=framed` or `&poster=none`). */
export const POSTER_MODE: PosterMode = 'sky';

/** The mode an address asks for (`#bonfire?step=1&poster=none`), else `POSTER_MODE`. */
export function posterModeOf(hash: string): PosterMode {
  const ask = /[?&]poster=(sky|framed|none)(?:&|$)/.exec(hash)?.[1];
  return ask === 'sky' || ask === 'framed' || ask === 'none' ? ask : POSTER_MODE;
}

/** The mode of the page being shown. */
export function posterMode(): PosterMode {
  return typeof window === 'undefined' ? POSTER_MODE : posterModeOf(window.location.hash);
}

const POSTER = { width: 64, height: 24 } as const;

const flipCache = new WeakMap<SpriteDef, SpriteDef>();

/** A sprite mirrored left to right (so a sky strip of copies meets itself at every seam). */
export function flippedX(sprite: SpriteDef): SpriteDef {
  let hit = flipCache.get(sprite);
  if (hit === undefined) {
    hit = { ...sprite, rows: sprite.rows.map((r) => [...r].reverse().join('')) };
    flipCache.set(sprite, hit);
  }
  return hit;
}

const skyCache = new Map<string, SpriteDef>();

/** The poster's top row repeated `rows` times: the sky carries on behind the HUD above the strip. */
function skyAbove(poster: SpriteDef, rows: number): SpriteDef {
  const key = `${poster.rows[0] ?? ''}|${String(rows)}`;
  let hit = skyCache.get(key);
  if (hit === undefined) {
    const first = poster.rows[0] ?? '';
    hit = { palette: poster.palette, rows: Array.from({ length: Math.max(1, rows) }, () => first) };
    skyCache.set(key, hit);
  }
  return hit;
}

/**
 * The poster as a sky strip: the picture in the middle and mirrored copies either side to both edges of the
 * scene, starting at the HUD's bottom (`g.top`); the sky above it is the picture's top row carried on.
 */
export function skyPlacements(poster: SpriteDef, g: SceneGeometry): Placement[] {
  const out: Placement[] = [];
  const x0 = g.cx - POSTER.width / 2;
  const from = Math.floor(-x0 / POSTER.width) - 1;
  const to = Math.ceil((g.W - x0) / POSTER.width);
  for (let k = from; k <= to; k++) {
    const copy = Math.abs(k) % 2 === 0 ? poster : flippedX(poster);
    const x = x0 + k * POSTER.width;
    out.push({ sprite: copy, x, y: g.top });
    out.push({ sprite: skyAbove(copy, g.top), x, y: 0 });
  }
  return out;
}

// --- The place's layout ---

const ART_SIZE: Readonly<Record<GlowName, { width: number; height: number }>> = {
  bonfire: { width: 56, height: 44 },
  'bonfire-grand': { width: 64, height: 50 },
  school: { width: 60, height: 50 },
  visitor: { width: 60, height: 48 },
  'visitor-away': { width: 60, height: 48 },
  market: { width: 60, height: 48 },
};

type Spots = Readonly<Record<string, { x: number; y: number }>>;

/**
 * Where a creature can stand in the art: feet points in the art's own pixels (x across, y down from the art's
 * top-left). `seat*` spots are on a log or a bench (the creature sits on it), `ground*` spots are on the grass in
 * front, the rest are named for what is there. Read off the sprites in `valley-glow.ts`; a scene turns them into
 * scene pixels with `glowLayout(...).spots`.
 */
export const ART_SPOTS: Readonly<Record<GlowName, Spots>> = {
  bonfire: {
    seatLeft: { x: 13, y: 31 },
    seatRight: { x: 44, y: 31 },
    seatFront: { x: 28, y: 38 },
    groundLeft: { x: 6, y: 40 },
    groundRight: { x: 50, y: 40 },
  },
  'bonfire-grand': {
    seatLeft: { x: 16, y: 32 },
    seatRight: { x: 48, y: 32 },
    seatFront: { x: 32, y: 45 },
    groundLeft: { x: 8, y: 46 },
    groundRight: { x: 56, y: 46 },
  },
  school: {
    door: { x: 30, y: 38 },
    sign: { x: 6, y: 35 },
    groundLeft: { x: 18, y: 45 },
    groundMiddle: { x: 30, y: 46 },
    groundRight: { x: 42, y: 45 },
  },
  visitor: {
    stranger: { x: 11, y: 40 },
    counter: { x: 42, y: 30 },
    groundLeft: { x: 22, y: 46 },
    groundRight: { x: 44, y: 44 },
  },
  'visitor-away': {
    board: { x: 11, y: 40 },
    counter: { x: 42, y: 30 },
    groundLeft: { x: 22, y: 46 },
    groundRight: { x: 44, y: 44 },
  },
  market: {
    counter: { x: 24, y: 30 },
    crystal: { x: 50, y: 24 },
    groundLeft: { x: 18, y: 46 },
    groundRight: { x: 42, y: 46 },
    crates: { x: 56, y: 40 },
  },
};

export interface GlowLayout {
  /** The screen's pixel scale (CSS px per art pixel), the same for everything on it. */
  s: number;
  /** The place's art: its top-left and size in scene pixels. */
  art: { x: number; y: number; width: number; height: number };
  /** A point of the art's own pixels in scene pixels. */
  at: (ax: number, ay: number) => { x: number; y: number };
  /** The art's named spots as scene-pixel feet points. */
  spots: Spots;
  /** The row just below the art (a sign or a creature stands here), in scene pixels. */
  below: number;
}

/** Scene pixels from the HUD's bottom to the art's top (the same in every poster mode, so a scene's layout holds). */
export const ART_TOP = 44;

/** Where the place's art stands in a scene, centred across it. */
export function glowLayout(g: SceneGeometry, name: GlowName = 'market'): GlowLayout {
  const { width, height } = ART_SIZE[name];
  const x = g.cx - Math.floor(width / 2);
  const y = g.top + ART_TOP;
  const at = (ax: number, ay: number): { x: number; y: number } => ({ x: x + ax, y: y + ay });
  const spots: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of Object.entries(ART_SPOTS[name])) spots[id] = at(p.x, p.y);
  return { s: g.s, art: { x, y, width, height }, at, spots, below: y + height };
}

/** Where things stand in these scenes (scene pixels): the framed poster's and the place's top-left, the row beneath. */
export function glowSceneSpots(g: SceneGeometry, name: GlowName = 'market') {
  const layout = glowLayout(g, name);
  return {
    poster: { x: g.cx - POSTER.width / 2, y: g.top + 6 },
    place: { x: layout.art.x, y: layout.art.y },
    below: layout.below,
    layout,
  };
}

// --- The ground ---

/** The grass the art was drawn on: the world map's by day, its night recolour at night (the library's backdrop). */
function groundTile(time: Time): SpriteDef {
  const backdrop = VALLEY_GLOW_CONCEPTS.backdrop;
  if (backdrop === undefined) throw new Error('valley-glow has no backdrop tile');
  const day = backdrop.alts?.['day'];
  return time === 'day' && day !== undefined ? swapPalette(backdrop.tile, day) : backdrop.tile;
}

/**
 * The scene: grass everywhere (the art's own ground, so by day its light spill is the grass itself), the poster
 * in its mode, the place beneath, a few trees and flowers.
 */
export function glowSceneDraw(spec: { name: GlowName; time: Time; poster?: PosterMode }) {
  const { name, time } = spec;
  const shade = (sprite: SpriteDef): SpriteDef => (time === 'night' ? dimmed(sprite) : sprite);
  return (g: SceneGeometry): Placement[] => {
    const mode = spec.poster ?? posterMode();
    const layout = glowLayout(g, name);
    const grass = groundTile(time);
    const out: Placement[] = [];
    for (let y = 0; y < g.H; y += TILE) {
      for (let x = 0; x < g.W; x += TILE) out.push({ sprite: grass, x, y });
    }
    const wm = WORLD_MAP_SPRITE_DATA;
    const { art } = layout;
    out.push(
      { sprite: shade(wm.smallPine), x: art.x - 30, y: art.y - 6 },
      { sprite: shade(wm.bush), x: art.x - 18, y: layout.below - 14 },
      { sprite: shade(wm.smallTree), x: art.x + art.width + 14, y: art.y - 2 },
      { sprite: shade(wm.flowers), x: art.x + art.width + 4, y: layout.below - 10 },
      { sprite: shade(wm.smallTree), x: art.x - 70, y: art.y + 20 },
      { sprite: shade(wm.smallPine), x: art.x + art.width + 52, y: art.y + 26 },
    );
    const poster = posterSprite(name);
    if (mode === 'sky') {
      out.push(...skyPlacements(poster, g));
    } else if (mode === 'framed') {
      const at = glowSceneSpots(g, name).poster;
      const frame = new PixelGrid(68, 28);
      frame.rect(0, 0, 68, 28, 'k');
      out.push(...gridPlacements(frame, { k: INK }, at.x - 2, at.y - 2));
      out.push({ sprite: poster, ...at });
    }
    out.push({ sprite: glowSprite(name, time), x: art.x, y: art.y });
    return out;
  };
}
