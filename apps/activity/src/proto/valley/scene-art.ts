/**
 * The insides of the places, as placements for `SceneFrame` (prototype, dev only). Each takes the width to
 * draw in whole tiles (`cols`) and where its content starts (`ox`, scene pixels), repeats its background
 * tiles across the whole width, and draws its content at `ox`. Built from the Games tiles, the living room's
 * props and the valley's new sprites; nothing new but a stair and a shelf.
 */
import type { RoomPhase } from '@creatures/game';
import { ROOM_SPRITE_DATA } from '../../sprites/data/room-sprites';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { roomScene } from '../../sprites/room-art';
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { tileFrame, type TileName } from '../../games/art/tiles';
import { RAMPS, maybeTint, type Ramp } from '../../games/art/tint';
import { ANVIL, TILE, type Placement } from './valley-art';

const INK = '#0d0a1a';
const EMBER_STONE: Ramp = ['#a07a6a', '#7a5048', '#5a3632', '#3a2024'];
const SLATE: Ramp = ['#7a7c96', '#585a73', '#3d3f52', '#2b2d3a'];

/** Rows of one tile repeated across `cols` columns, from tile row `from` for `count` rows. */
function band(tile: TileName, cols: number, from: number, count: number, tint?: Ramp): Placement[] {
  const out: Placement[] = [];
  const sprite = maybeTint(tileFrame(tile), tint);
  for (let r = from; r < from + count; r++) {
    for (let c = 0; c < cols; c++) out.push({ sprite, x: c * TILE, y: r * TILE });
  }
  return out;
}

/** A wooden plank shelf `w` px wide. */
function shelf(w: number, x: number, y: number): Placement[] {
  const g = new PixelGrid(w, 4);
  g.rect(0, 0, w, 4, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 1, 'c');
  g.rect(2, 3, 2, 1, '.');
  g.rect(w - 4, 3, 2, 1, '.');
  return gridPlacements(g, { a: RAMPS.wood[1], c: RAMPS.wood[3], k: INK }, x, y);
}

// --- Forge ---

export const FORGE_SIZE = { width: 128, height: 96 } as const;
/** The forge's job slots (the anvils), its chest and its parts shelf, in scene pixels. */
export const FORGE_ANVILS = [
  { x: 34, y: 70 },
  { x: 80, y: 70 },
] as const;
export const FORGE_CHEST = { x: 108, y: 70 } as const;
export const FORGE_SHELF = { x: 4, y: 20, width: 36 } as const;

export function forgeDraw(cols: number, ox: number): Placement[] {
  const fire = ROOM_SPRITE_DATA.fireplace.day;
  return [
    ...band('stoneWall', cols, 0, 4, EMBER_STONE),
    ...band('dirt', cols, 4, 2),
    ...(fire === undefined ? [] : [{ sprite: fire, x: ox + 46, y: 29 }]),
    ...shelf(FORGE_SHELF.width, ox + FORGE_SHELF.x, FORGE_SHELF.y + 12),
    ...FORGE_ANVILS.map((a) => ({ sprite: ANVIL, x: ox + a.x, y: a.y })),
  ];
}

// --- Arena ---

export const ARENA_SIZE = { width: 128, height: 128 } as const;
/** The boss's top-left (its 24 px sprite drawn one scale up) and the board under it. */
export const ARENA_BOSS_AT = { x: 52, y: 14 } as const;
/** The board: three lines (front nearest the boss), three lanes, 22 px apart, on the sand. */
export const ARENA_BOARD = { x: 31, y: 56, step: 22 } as const;

export function arenaDraw(cols: number, ox: number): Placement[] {
  void ox;
  return [
    ...band('bleacher', cols, 0, 1),
    ...band('sand', cols, 1, 7),
    ...band('bunting', cols, 0, 1),
  ];
}

// --- House (the living room) ---

/** The room's content: the game's living room, 288 x 56. */
export const HOUSE_SIZE = { width: 288, height: 56 } as const;
const ROOM_TOP = 0;

export function houseDraw(phase: RoomPhase): (cols: number, ox: number) => Placement[] {
  return (cols, ox) => {
    const scene = roomScene(phase);
    const out: Placement[] = [];
    // The wall and floor continue at the room's sides.
    for (let x = 0; x < cols * TILE; x += 16) out.push({ sprite: scene.edgeTile, x, y: ROOM_TOP });
    for (const p of scene.props) {
      if (p.layer === 'back') out.push({ sprite: p.sprite, x: ox + p.x, y: ROOM_TOP + p.y });
    }
    out.push({ sprite: scene.trophy, x: ox + 168, y: ROOM_TOP + 17 });
    return out;
  };
}

/** The room's front props (couch arms, the table): drawn over the creatures. */
export function houseFront(phase: RoomPhase, ox: number): Placement[] {
  return roomScene(phase)
    .props.filter((p) => p.layer === 'front')
    .map((p) => ({ sprite: p.sprite, x: ox + p.x, y: ROOM_TOP + p.y }));
}

export { ROOM_TOP };

// --- Cave (the Dungeon) ---

export const CAVE_SIZE = { width: 128, height: 80 } as const;

/** A slate stair going down to the right into the dark: five steps of 12 x 8. */
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

export const CAVE_LANTERN = { x: 44, y: 24 } as const;
export const CAVE_LANDING = { x: 14, y: 16 } as const;

export function caveDraw(cols: number, ox: number): Placement[] {
  return [
    ...band('stoneWall', cols, 0, 5, SLATE),
    ...stair(ox + 30, 32),
    { sprite: WORLD_MAP_SPRITE_DATA.rock, x: ox + 6, y: 70 },
  ];
}

// --- Fairground (the Valley Games) ---

export const FAIR_SIZE = { width: 128, height: 64 } as const;

export function fairDraw(cols: number, ox: number): Placement[] {
  return [
    ...band('sky', cols, 0, 1),
    ...band('skyLow', cols, 1, 1),
    ...band('grass', cols, 2, 2),
    ...band('hillsA', cols, 1, 1),
    ...band('bunting', cols, 1, 1),
    { sprite: WORLD_MAP_SPRITE_DATA.festivalGrounds, x: ox + 36, y: 14 },
    { sprite: WORLD_MAP_SPRITE_DATA.smallTree, x: ox + 4, y: 40 },
    { sprite: WORLD_MAP_SPRITE_DATA.smallPine, x: ox + 110, y: 38 },
  ];
}

// --- Paddock (your creatures) ---

export const PADDOCK_SIZE = { width: 128, height: 64 } as const;

export function paddockDraw(cols: number, ox: number): Placement[] {
  void ox;
  return [...band('grass', cols, 0, 4), ...band('fence', cols, 0, 1), ...band('fence', cols, 3, 1)];
}
