/**
 * The ground of the four newer places' scenes (the bonfire, the School, the visitor's stall, the Market), as
 * placements for `SceneFrame`: grass to every edge, the sky (`valley-sky`, tiled sideways, its top row carried
 * up behind the HUD, the moon once at night) above it, and the place itself (its `valley-glow` sprite) standing
 * in the light of the valley. The posters (`valley-posters`, `&poster=sky|framed`) stay only for comparison.
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
import { VALLEY_SKY_CONCEPTS } from '../../sprites/concepts/valley-sky';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import { tileFrame } from '../../games/art/tiles';
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import type { SceneGeometry } from './SceneFrame';
import type { Waiting } from '../welcome/PlaceStories';
import type { ProtoWorld } from '../world';
import { SCHOOL_AT, YARD_AT, yardSprite } from './school-yard';
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

// --- The poster's three modes (Q50, Misa: C, no poster on a place's screen; the other two stay for comparison until a real sky backdrop replaces them) ---

/** How the place's poster is shown: a sky strip edge to edge, a framed picture, or not at all. */
export type PosterMode = 'sky' | 'framed' | 'none';

/** The mode used unless the address says otherwise (`&poster=sky` or `&poster=framed`): none (Q50). */
export const POSTER_MODE: PosterMode = 'none';

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

const edgeCache = new Map<string, SpriteDef>();

/**
 * One edge of the poster carried sideways: a sprite as wide as the poster whose every row is that row's pixel at
 * the poster's left or right edge, with the poster's top row carried up `above` rows (behind the HUD). Tiled to
 * the scene's edge it extends the picture's own sky and ground, never a second copy of the picture.
 */
function edgeFill(poster: SpriteDef, side: 'left' | 'right', above: number): SpriteDef {
  const key = `${side}|${String(above)}|${poster.rows.join('')}`;
  let hit = edgeCache.get(key);
  if (hit === undefined) {
    const at = (row: string): string => (side === 'left' ? row[0] : row[row.length - 1]) ?? '.';
    const edge = poster.rows.map((r) => at(r).repeat(POSTER.width));
    const top = edge[0] ?? '.'.repeat(POSTER.width);
    hit = { palette: poster.palette, rows: [...Array.from({ length: above }, () => top), ...edge] };
    edgeCache.set(key, hit);
  }
  return hit;
}

const aboveCache = new Map<string, SpriteDef>();

/** The poster's top row repeated `rows` times: the sky carries on behind the HUD above the picture. */
function skyAbove(poster: SpriteDef, rows: number): SpriteDef {
  const key = `${String(rows)}|${poster.rows.join('')}`;
  let hit = aboveCache.get(key);
  if (hit === undefined) {
    const first = poster.rows[0] ?? '';
    hit = { palette: poster.palette, rows: Array.from({ length: Math.max(1, rows) }, () => first) };
    aboveCache.set(key, hit);
  }
  return hit;
}

/**
 * The poster as a sky strip: one copy of the picture, centred, starting at the HUD's bottom (`g.top`); either
 * side of it the picture's own edge columns carry on to the scene's edges, and its top row carries up behind
 * the HUD. Never a second copy of the picture.
 */
export function skyPlacements(poster: SpriteDef, g: SceneGeometry): Placement[] {
  const x0 = g.cx - POSTER.width / 2;
  const out: Placement[] = [
    { sprite: skyAbove(poster, g.top), x: x0, y: 0 },
    { sprite: poster, x: x0, y: g.top },
  ];
  const left = edgeFill(poster, 'left', g.top);
  const right = edgeFill(poster, 'right', g.top);
  for (let x = x0 - POSTER.width; x > -POSTER.width; x -= POSTER.width)
    out.push({ sprite: left, x, y: 0 });
  for (let x = x0 + POSTER.width; x < g.W; x += POSTER.width) out.push({ sprite: right, x, y: 0 });
  return out;
}

// --- The place's layout ---

const ART_SIZE: Readonly<Record<GlowName, { width: number; height: number }>> = {
  bonfire: { width: 56, height: 44 },
  'bonfire-grand': { width: 64, height: 50 },
  // The School's own art is 60x50; its yard (80x24, 38 rows down) makes the composition 80x62.
  school: { width: 80, height: 62 },
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
    door: { x: 32, y: 38 },
    sign: { x: 8, y: 35 },
    groundLeft: { x: 20, y: 45 },
    groundMiddle: { x: 32, y: 46 },
    groundRight: { x: 44, y: 45 },
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

/**
 * Scene pixels from the HUD's bottom to the art's top. With the sky strip (or no poster) the art stands on the
 * grass in front of the strip's lower edge; with the framed poster it stands below the frame.
 */
export function artTop(mode: PosterMode): number {
  if (mode === 'framed') return 34;
  return mode === 'sky' ? 14 : 20;
}

// --- The sky backdrop (Q50: a sky behind every place's screen instead of the poster) ---

/** The `valley-sky` strip's size in its own pixels: it tiles sideways every `SKY_WIDTH`. */
export const SKY_WIDTH = 128;
export const SKY_ROWS = 40;
/** Scene pixels the strip's bottom (the grass) lies below the top of the art: the hills end behind the place. */
const SKY_BELOW_ART_TOP = 14;

/** The sky in the light asked for: night is the set's main palette, day its `alts.day` recolour. Cached. */
const skyCache = new Map<string, SpriteDef>();
export function skySprite(time: Time): SpriteDef {
  let hit = skyCache.get(time);
  if (hit === undefined) {
    const concept = VALLEY_SKY_CONCEPTS.sprites['valley'];
    if (concept === undefined) throw new Error('valley-sky has no valley sprite');
    const day = concept.alts?.['day'];
    hit = time === 'day' && day !== undefined ? swapPalette(concept.sprite, day) : concept.sprite;
    skyCache.set(time, hit);
  }
  return hit;
}

/** The moon (10 x 10), placed once in the night sky. */
export function moonSprite(): SpriteDef {
  const concept = VALLEY_SKY_CONCEPTS.sprites['moon'];
  if (concept === undefined) throw new Error('valley-sky has no moon sprite');
  return concept.sprite;
}

const topCache = new Map<string, SpriteDef>();

/** The strip's top row repeated `rows` times, `SKY_WIDTH` wide: the sky carried upward behind the HUD. */
function skyTop(sky: SpriteDef, rows: number): SpriteDef {
  const key = `${String(rows)}|${sky.rows[0] ?? ''}`;
  let hit = topCache.get(key);
  if (hit === undefined) {
    hit = { palette: sky.palette, rows: Array.from({ length: rows }, () => sky.rows[0] ?? '') };
    topCache.set(key, hit);
  }
  return hit;
}

/** The left edges of the strip's copies across a scene `width` wide: one copy centred, the rest beside it. */
export function skyColumns(width: number, cx: number): number[] {
  const first = cx - SKY_WIDTH / 2;
  let x = first - Math.ceil(first / SKY_WIDTH) * SKY_WIDTH;
  const out: number[] = [];
  for (; x < width; x += SKY_WIDTH) out.push(x);
  return out;
}

/** Where the strip's top-left row stands: its last row (the grass) is `SKY_BELOW_ART_TOP` under the art's top. */
export function skyTopRow(g: SceneGeometry, mode: PosterMode): number {
  return g.top + artTop(mode) + SKY_BELOW_ART_TOP - SKY_ROWS;
}

/**
 * The sky: the strip tiled sideways edge to edge at the scene's scale, its top row's colour carried up to the
 * top edge (behind the HUD), its last row meeting the grass. At night the moon stands once in it, to the
 * right of the place; by day there is none.
 */
export function skyBackdrop(g: SceneGeometry, time: Time, mode: PosterMode): Placement[] {
  const sky = skySprite(time);
  const y = skyTopRow(g, mode);
  const above = skyTop(sky, Math.max(1, y));
  const out: Placement[] = [];
  for (const x of skyColumns(g.W, g.cx)) {
    if (y > 0) out.push({ sprite: above, x, y: 0 });
    out.push({ sprite: sky, x, y });
  }
  if (time === 'night') {
    const moon = moonSprite();
    const x = Math.min(g.W - 14, g.cx + 30);
    out.push({ sprite: moon, x: Math.max(4, x), y: y + 12 });
  }
  return out;
}

/** Where the place's art stands in a scene, centred across it. */
export function glowLayout(
  g: SceneGeometry,
  name: GlowName = 'market',
  mode: PosterMode = posterMode(),
): GlowLayout {
  const { width, height } = ART_SIZE[name];
  const x = g.cx - Math.floor(width / 2);
  const y = g.top + artTop(mode);
  const at = (ax: number, ay: number): { x: number; y: number } => ({ x: x + ax, y: y + ay });
  const spots: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of Object.entries(ART_SPOTS[name])) spots[id] = at(p.x, p.y);
  return { s: g.s, art: { x, y, width, height }, at, spots, below: y + height };
}

/** The most the art fills of a scene's width, and the pixel scales a place's scene may use. */
const FILL = 0.85;
const SCALE_MIN = 3;
const SCALE_MAX = 6;
/** CSS px a scene keeps under the art for what stands below it (a row of creatures, stones, plates) and its button. */
const BELOW_ART_CSS = 190;

/**
 * The one pixel scale of a place's scene: the largest whole number (3 to 6) at which the place's art fills
 * about three quarters of the scene's width (never over 85 percent) and the art, the row under it and the
 * pinned button still fit the scene's height. The poster, the art, the grass and every creature in the scene
 * are drawn at it; the tray is UI and keeps its own.
 */
export function glowScale(
  width: number,
  height: number,
  name: GlowName,
  mode: PosterMode = posterMode(),
): number {
  const art = ART_SIZE[name];
  let s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((0.75 * width) / art.width)));
  while (s > SCALE_MIN && art.width * s > FILL * width) s -= 1;
  const fits = (n: number): boolean =>
    (Math.ceil(56 / n) + artTop(mode) + art.height) * n + BELOW_ART_CSS <= height;
  while (s > SCALE_MIN && !fits(s)) s -= 1;
  return s;
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

/** The valley map's own day grass (a tile of the Valley Games set), and at night the art's night grass. */
function groundTile(time: Time): SpriteDef {
  if (time === 'day') return tileFrame('grass');
  const backdrop = VALLEY_GLOW_CONCEPTS.backdrop;
  if (backdrop === undefined) throw new Error('valley-glow has no backdrop tile');
  return backdrop.tile;
}

/**
 * The scene: grass everywhere (the valley map's day grass, the art's night grass at night), the poster
 * in its mode, the place beneath, a few trees and flowers.
 */
export function glowSceneDraw(spec: { name: GlowName; time: Time; poster?: PosterMode }) {
  const { name, time } = spec;
  const shade = (sprite: SpriteDef): SpriteDef => (time === 'night' ? dimmed(sprite) : sprite);
  return (g: SceneGeometry): Placement[] => {
    const mode = spec.poster ?? posterMode();
    const layout = glowLayout(g, name, mode);
    const grass = groundTile(time);
    const out: Placement[] = [];
    for (let y = 0; y < g.H; y += TILE) {
      for (let x = 0; x < g.W; x += TILE) out.push({ sprite: grass, x, y });
    }
    out.push(...skyBackdrop(g, time, mode));
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
    if (name === 'school') {
      // The yard under the School (the School covers its top rows); the lectern, teacher and students are the scene's.
      out.push({ sprite: yardSprite(time), ...layout.at(YARD_AT.x, YARD_AT.y) });
      out.push({ sprite: glowSprite(name, time), ...layout.at(SCHOOL_AT.x, SCHOOL_AT.y) });
      return out;
    }
    out.push({ sprite: glowSprite(name, time), x: art.x, y: art.y });
    return out;
  };
}
