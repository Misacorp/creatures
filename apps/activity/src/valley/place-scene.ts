/**
 * The ground of a place's scene (the four places that are not open yet: the bonfire, the School, the visitor's
 * stall and the Market), as placements for `SceneFrame`: grass to every edge, the valley's sky (`valley-sky`,
 * tiled sideways, its top row carried up to the top edge) above it, and the place itself (its `valley-glow`
 * sprite) standing in the day light among a few trees. One pixel scale for the whole screen (`g.s`). Pure.
 */
import { VALLEY_SKY_CONCEPTS } from '../sprites/concepts/valley-sky';
import { WORLD_MAP_SPRITE_DATA } from '../sprites/data/world-map-sprites';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';
import { tileFrame } from '../games/art/tiles';
import { TOP_CLEAR, type SceneGeometry } from './SceneFrame';
import { sceneScale } from './scale';
import { TILE, type Placement } from './valley-art';
import { glowSprite, type MapName } from './valley-places';

/** The `valley-sky` strip's size in its own pixels: it tiles sideways every `SKY_WIDTH`. */
export const SKY_WIDTH = 128;
export const SKY_ROWS = 40;
/** Scene pixels from the top of the place's art to the sky strip's bottom row (the grass): the hills end behind the place. */
const SKY_BELOW_ART_TOP = 14;
/** Scene pixels from the top of the scene's clear zone to the top of the place's art. */
const ART_TOP = 20;

const SCALE_MIN = 3;
const SCALE_MAX = 6;
/** The most the art fills of a scene's width. */
const FILL = 0.85;
/** CSS px a scene keeps under the art for the pinned line and some grass. */
const BELOW_ART_CSS = 120;

let sky: SpriteDef | undefined;

/** The sky by day: the set's main palette is night, its `alts.day` is the recolour. Cached. */
export function skySprite(): SpriteDef {
  if (sky !== undefined) return sky;
  const concept = VALLEY_SKY_CONCEPTS.sprites['valley'];
  if (concept === undefined) throw new Error('valley-sky has no valley sprite');
  const day = concept.alts?.['day'];
  sky = day === undefined ? concept.sprite : swapPalette(concept.sprite, day);
  return sky;
}

const topCache = new Map<string, SpriteDef>();

/** The strip's top row repeated `rows` times, `SKY_WIDTH` wide: the sky carried upward to the scene's top edge. */
function skyTop(strip: SpriteDef, rows: number): SpriteDef {
  const key = `${String(rows)}|${strip.rows[0] ?? ''}`;
  let hit = topCache.get(key);
  if (hit === undefined) {
    hit = { palette: strip.palette, rows: Array.from({ length: rows }, () => strip.rows[0] ?? '') };
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
export function skyTopRow(g: SceneGeometry, artTop: number = ART_TOP): number {
  return g.top + artTop + SKY_BELOW_ART_TOP - SKY_ROWS;
}

/** The sky: the strip tiled sideways edge to edge at the scene's scale, its top row carried up to the top edge. */
export function skyBackdrop(g: SceneGeometry, artTop: number = ART_TOP): Placement[] {
  const strip = skySprite();
  const y = skyTopRow(g, artTop);
  const above = skyTop(strip, Math.max(1, y));
  const out: Placement[] = [];
  for (const x of skyColumns(g.W, g.cx)) {
    if (y > 0) out.push({ sprite: above, x, y: 0 });
    out.push({ sprite: strip, x, y });
  }
  return out;
}

/** A place's art size in its own pixels. */
export function artSize(name: MapName): { width: number; height: number } {
  const sprite = glowSprite(name);
  return { width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}

/**
 * The one pixel scale of a place's scene: the largest whole number (3 to 6) at which the art fills about three
 * quarters of the scene's width (never over 85 percent) and the art and the pinned line still fit its height.
 */
export function placeScale(width: number, height: number, name: MapName): number {
  const art = artSize(name);
  let s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((0.75 * width) / art.width)));
  while (s > SCALE_MIN && art.width * s > FILL * width) s -= 1;
  const fits = (n: number): boolean =>
    (Math.ceil(TOP_CLEAR / n) + ART_TOP + art.height) * n + BELOW_ART_CSS <= height;
  while (s > SCALE_MIN && !fits(s)) s -= 1;
  return s;
}

/** The grass of a scene (the valley map's day grass) to every edge. */
function grassTo(g: SceneGeometry): Placement[] {
  const grass = tileFrame('grass');
  const out: Placement[] = [];
  for (let row = 0; row < g.H; row += TILE) {
    for (let col = 0; col < g.W; col += TILE) out.push({ sprite: grass, x: col, y: row });
  }
  return out;
}

/** The trees, a bush and flowers round a place's art at (`x`, `y`) in scene pixels. */
function treesAround(x: number, y: number, art: { width: number; height: number }): Placement[] {
  const wm = WORLD_MAP_SPRITE_DATA;
  const below = y + art.height;
  return [
    { sprite: wm.smallPine, x: x - 30, y: y - 6 },
    { sprite: wm.bush, x: x - 18, y: below - 14 },
    { sprite: wm.smallTree, x: x + art.width + 14, y: y - 2 },
    { sprite: wm.flowers, x: x + art.width + 4, y: below - 10 },
    { sprite: wm.smallTree, x: x - 70, y: y + 20 },
    { sprite: wm.smallPine, x: x + art.width + 52, y: y + 26 },
  ];
}

/** The scene: grass everywhere (the valley map's day grass), the sky, the place in the middle, a few trees. */
export function placeSceneDraw(name: MapName) {
  return (g: SceneGeometry): Placement[] => {
    const art = artSize(name);
    const x = g.cx - Math.floor(art.width / 2);
    const y = g.top + ART_TOP;
    return [
      ...grassTo(g),
      ...skyBackdrop(g),
      ...treesAround(x, y, art),
      { sprite: glowSprite(name), x, y },
    ];
  };
}

// --- The band: a place's scene above today's page ---

/** The scene's height in scene pixels: the sky, the place's art and the row of creatures in front of it. */
export const BAND_ROWS = 88;
/** Scene pixels from the clear zone's bottom to the top of the place's art in a band. */
const BAND_ART_TOP = 8;

/** A band's one pixel scale: 3 on a phone, 4 from 700 px wide (the same as every scene). */
export function bandScale(width: number): number {
  return sceneScale(width);
}

export interface ArtBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a place's art stands in a band (scene pixels). */
export function bandArtBox(g: SceneGeometry, name: MapName): ArtBox {
  const art = artSize(name);
  return { x: g.cx - Math.floor(art.width / 2), y: g.top + BAND_ART_TOP, ...art };
}

/** The band's scene: as `placeSceneDraw`, the art higher up to leave the creatures room in front, plus `extra` over it. */
export function bandSceneDraw(name: MapName, extra?: (box: ArtBox) => Placement[]) {
  return (g: SceneGeometry): Placement[] => {
    const box = bandArtBox(g, name);
    return [
      ...grassTo(g),
      ...skyBackdrop(g, BAND_ART_TOP),
      ...treesAround(box.x, box.y, box),
      { sprite: glowSprite(name), x: box.x, y: box.y },
      ...(extra?.(box) ?? []),
    ];
  };
}
