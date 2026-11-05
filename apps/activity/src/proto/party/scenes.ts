/**
 * The insides of the places, as placements: each scene's back wall and floor run on to the edges of the
 * field (`cols` x `rows` tiles), with its content (a fireplace, anvils, a boss on sand) at (`ox`, `oy`).
 * Built from the Games tiles and props, the living room and the world map; the anvil, chest and sack come
 * from `sprites.ts`. Pure.
 */
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { roomScene } from '../../sprites/room-art';
import { PixelGrid, gridPlacements, type Placement } from '../../games/art/pixel';
import { TILE, tileFrame, type TileName } from '../../games/art/tiles';
import { propSprite } from '../../games/art/props';
import { maybeTint, RAMPS, type Ramp } from '../../games/art/tint';
import { ANVIL, CHEST_FRAMES, INK, bench, pathPiece, upscale } from './sprites';
import { roomProp } from './world-draw';

const EMBER_STONE: Ramp = ['#a07a6a', '#7a5048', '#5a3632', '#3a2024'];
const SLATE: Ramp = ['#7a7c96', '#585a73', '#3d3f52', '#2b2d3a'];

export type SceneId = 'forge' | 'arena' | 'cave' | 'house' | 'chest' | 'lectern' | 'fair' | 'haul';

export interface SceneDef {
  /** The content's size in scene pixels. */
  width: number;
  height: number;
  /** The scene for a field `cols` x `rows` tiles, its content's top-left at (`ox`, `oy`). */
  draw: (cols: number, rows: number, ox: number, oy: number) => Placement[];
}

/** Tile rows `from` (scene px, may be negative) to `to` across the whole width. */
function band(tile: TileName, cols: number, from: number, to: number, tint?: Ramp): Placement[] {
  const out: Placement[] = [];
  const sprite = maybeTint(tileFrame(tile), tint);
  const start = Math.floor(from / TILE) * TILE;
  for (let y = start; y < to; y += TILE) {
    for (let c = 0; c < cols; c++) out.push({ sprite, x: c * TILE, y });
  }
  return out;
}

/** The forge's anvils (scene px, content coordinates). */
export const FORGE_ANVILS = [
  { x: 26, y: 66 },
  { x: 86, y: 66 },
] as const;
/** The workbench where the blueprints lie. */
export const FORGE_BENCH = { x: 14, y: 100, width: 100 } as const;

/** Where a wall ends and the floor starts in each scene (content y). */
export const WALL_END: Readonly<Record<SceneId, number>> = {
  forge: 64,
  arena: 16,
  cave: 200,
  house: 56,
  chest: 56,
  lectern: 56,
  fair: 48,
  haul: 0,
};

export const ARENA_BOSS = { x: 52, y: 20 } as const;
/** The lane board: three lines (front nearest the boss) of three seats, 26 px apart. */
export const ARENA_SEATS = { x: 25, y: 58, step: 26, width: 22, height: 20 } as const;

export const CAVE_TEAM = [
  { x: 10, y: 70 },
  { x: 30, y: 70 },
  { x: 50, y: 70 },
] as const;

/** A slate stair going down to the right into the dark. */
function stair(x: number, y: number): Placement[] {
  const g = new PixelGrid(80, 48);
  for (let i = 0; i < 6; i++) {
    const sx = i * 12;
    const sy = i * 8;
    g.rect(sx, sy, 80 - sx, 8, 'k');
    g.rect(sx + 1, sy + 1, 80 - sx - 1, 1, 'a');
    g.rect(sx + 1, sy + 2, 80 - sx - 1, 5, 'c');
    g.rect(sx + 1, sy + 7, 80 - sx - 1, 1, 'd');
  }
  return gridPlacements(g, { a: SLATE[0], c: SLATE[2], d: SLATE[3], k: INK }, x, y);
}

/** A lantern on a hook (6 x 10), lit. */
function lantern(x: number, y: number): Placement[] {
  const g = new PixelGrid(6, 10);
  g.rect(2, 0, 2, 2, 'k');
  g.rect(0, 2, 6, 8, 'k');
  g.rect(1, 3, 4, 6, 'y');
  g.rect(2, 4, 2, 3, 'w');
  return gridPlacements(g, { k: INK, y: '#f2b84b', w: '#fff2a8' }, x, y);
}

/** A flat landing of slate (the cave team stands on it). */
function landing(x: number, y: number, w: number): Placement[] {
  const g = new PixelGrid(w, 6);
  g.rect(0, 0, w, 6, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 4, 'c');
  return gridPlacements(g, { a: SLATE[0], c: SLATE[1], k: INK }, x, y);
}

export const SCENES: Readonly<Record<SceneId, SceneDef>> = {
  forge: {
    width: 128,
    height: 118,
    draw: (cols, rows, ox, oy) => [
      ...band('stoneWall', cols, 0, oy + WALL_END.forge, EMBER_STONE),
      ...band('dirt', cols, oy + WALL_END.forge, rows * TILE),
      { sprite: roomProp('fireplace'), x: ox + 46, y: oy + 29 },
      ...FORGE_ANVILS.map((a) => ({ sprite: ANVIL, x: ox + a.x, y: oy + a.y })),
      ...bench(ox + FORGE_BENCH.x, oy + FORGE_BENCH.y, FORGE_BENCH.width),
      // Past the content's edges (a wide window): stock and tools.
      { sprite: propSprite('crate'), x: ox - 46, y: oy + 80 },
      { sprite: propSprite('barrel'), x: ox - 24, y: oy + 76 },
      { sprite: propSprite('barrel'), x: ox + 140, y: oy + 76 },
      { sprite: propSprite('crate'), x: ox + 162, y: oy + 80 },
      { sprite: roomProp('bookshelf'), x: ox - 40, y: oy + 36 },
      { sprite: roomProp('clock'), x: ox + 150, y: oy + 40 },
    ],
  },
  arena: {
    width: 128,
    height: 140,
    draw: (cols, rows, _ox, oy) => [
      ...band('bleacher', cols, 0, oy + WALL_END.arena),
      ...band('sand', cols, oy + WALL_END.arena, rows * TILE),
      ...band('bunting', cols, oy + WALL_END.arena - TILE, oy + WALL_END.arena),
    ],
  },
  cave: {
    width: 128,
    height: 100,
    draw: (cols, rows, ox, oy) => [
      ...band('stoneWall', cols, 0, rows * TILE, SLATE),
      ...landing(ox + 4, oy + 86, 70),
      ...stair(ox + 70, oy + 40),
      ...lantern(ox + 40, oy + 26),
      ...lantern(ox - 36, oy + 30),
      ...lantern(ox + 168, oy + 30),
      { sprite: WORLD_MAP_SPRITE_DATA.rock, x: ox - 20, y: oy + 92 },
      { sprite: WORLD_MAP_SPRITE_DATA.rock, x: ox + 112, y: oy + 90 },
    ],
  },
  house: {
    width: 288,
    height: 72,
    draw: (cols, rows, ox, oy) => {
      const scene = roomScene('day');
      const out: Placement[] = [];
      // The wall continues up, the floor down, past the room's own 56 px.
      const wall = maybeTint(tileFrame('woodWall'), RAMPS.night);
      for (let y = oy - TILE; y > -TILE * 2; y -= TILE) {
        for (let c = 0; c < cols; c++) out.push({ sprite: wall, x: c * TILE, y });
      }
      out.push(...band('planks', cols, oy + 56, rows * TILE, RAMPS.wood));
      for (let x = 0; x < cols * TILE; x += 16) out.push({ sprite: scene.edgeTile, x, y: oy });
      for (const p of scene.props) {
        if (p.layer === 'back') out.push({ sprite: p.sprite, x: ox + p.x, y: oy + p.y });
      }
      return out;
    },
  },
  chest: {
    width: 128,
    height: 120,
    draw: (cols, rows, ox, oy) => [
      ...band('woodWall', cols, 0, oy + WALL_END.chest),
      ...band('planks', cols, oy + WALL_END.chest, rows * TILE),
      { sprite: upscale(CHEST_FRAMES[2] ?? ANVIL, 2), x: ox + 48, y: oy + 30 },
      { sprite: propSprite('crate'), x: ox - 30, y: oy + 50 },
      { sprite: propSprite('barrel'), x: ox + 146, y: oy + 46 },
      { sprite: roomProp('plant'), x: ox + 120, y: oy + 44 },
    ],
  },
  lectern: {
    width: 128,
    height: 110,
    draw: (cols, rows, ox, oy) => [
      ...band('woodWall', cols, 0, oy + WALL_END.lectern),
      ...band('planks', cols, oy + WALL_END.lectern, rows * TILE),
      { sprite: roomProp('bookshelf'), x: ox + 4, y: oy + 32 },
      { sprite: roomProp('bookshelf'), x: ox + 96, y: oy + 32 },
      { sprite: roomProp('bookshelf'), x: ox - 34, y: oy + 32 },
      { sprite: roomProp('bookshelf'), x: ox + 134, y: oy + 32 },
      { sprite: roomProp('lamp'), x: ox + 57, y: oy + 2 },
    ],
  },
  fair: {
    width: 128,
    height: 120,
    draw: (cols, rows, ox, oy) => [
      ...band('sky', cols, 0, oy + 16),
      ...band('skyLow', cols, oy + 16, oy + 32),
      ...band('hillsA', cols, oy + 16, oy + 32),
      ...band('grass', cols, oy + 32, rows * TILE),
      ...band('bunting', cols, oy + 16, oy + 32),
      { sprite: WORLD_MAP_SPRITE_DATA.festivalGrounds, x: ox + 36, y: oy + 6 },
      { sprite: WORLD_MAP_SPRITE_DATA.smallTree, x: ox + 6, y: oy + 34 },
      { sprite: WORLD_MAP_SPRITE_DATA.smallPine, x: ox + 110, y: oy + 32 },
    ],
  },
  haul: {
    width: 128,
    height: 64,
    draw: (cols, rows, ox, oy) => [
      ...band('grass', cols, 0, rows * TILE),
      ...pathPiece(0, oy + 40, cols * TILE, 10),
      { sprite: WORLD_MAP_SPRITE_DATA.oldCrossroads, x: ox - 40, y: oy + 6 },
      { sprite: WORLD_MAP_SPRITE_DATA.smallTree, x: ox + 112, y: oy + 22 },
    ],
  },
};
