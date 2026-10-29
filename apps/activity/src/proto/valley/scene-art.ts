/**
 * The insides of the places, full screen (round 2), as placements for `SceneFrame`. Each fills the whole
 * scene (`g.W` x `g.H` scene pixels): its wall runs across the top to every edge and its floor down to the
 * bottom, and its furniture stands round the middle (`g.cx`). The layout constants say where things stand,
 * relative to the middle and to the floor line, so the scene components put their buttons on the same spots.
 * Built from the Games tiles, the living room's props and the valley's new sprites.
 */
import type { RoomPhase } from '@creatures/game';
import { ROOM_SPRITE_DATA } from '../../sprites/data/room-sprites';
import type { SpriteDef } from '../../sprites/sprite-data';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { roomScene } from '../../sprites/room-art';
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { propSprite } from '../../games/art/props';
import { tileFrame, type TileName } from '../../games/art/tiles';
import { RAMPS, maybeTint, type Ramp } from '../../games/art/tint';
import type { SceneGeometry } from './SceneFrame';
import { ANVIL, TILE, type Placement } from './valley-art';

const INK = '#0d0a1a';
const EMBER_STONE: Ramp = ['#a07a6a', '#7a5048', '#5a3632', '#3a2024'];
const SLATE: Ramp = ['#7a7c96', '#585a73', '#3d3f52', '#2b2d3a'];

/** Tile rows from scene pixel `y0` (inclusive) to `y1` (exclusive), across the whole width. */
function band(tile: TileName, g: SceneGeometry, y0: number, y1: number, tint?: Ramp): Placement[] {
  const out: Placement[] = [];
  const sprite = maybeTint(tileFrame(tile), tint);
  for (let y = y0; y < y1; y += TILE) {
    for (let x = 0; x < g.W; x += TILE) out.push({ sprite, x, y });
  }
  return out;
}

/** A wooden plank (a shelf, a workbench top) `w` px wide and `h` tall, on two legs when `legs`. */
function plank(w: number, h: number, x: number, y: number, legs = 0): Placement[] {
  const g = new PixelGrid(w, h + legs);
  g.rect(0, 0, w, h, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, h - 3, 'b');
  g.rect(1, h - 1, w - 2, 1, 'c');
  if (legs > 0) {
    g.rect(3, h, 3, legs, 'k');
    g.rect(w - 6, h, 3, legs, 'k');
    g.rect(4, h, 1, legs - 1, 'c');
    g.rect(w - 5, h, 1, legs - 1, 'c');
  }
  return gridPlacements(g, { a: RAMPS.wood[0], b: RAMPS.wood[1], c: RAMPS.wood[3], k: INK }, x, y);
}

/**
 * Props along a row outside the content's span (`from`..`to`, scene pixels), every `step` px, cycling through
 * `sprites`; each stands with its feet on `feet`. A wide window then shows a full room, not a bare floor.
 */
function sides(
  g: SceneGeometry,
  from: number,
  to: number,
  feet: number,
  step: number,
  sprites: readonly SpriteDef[],
): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (x: number): void => {
    const sprite = sprites[i % sprites.length];
    i += 1;
    if (sprite === undefined) return;
    out.push({ sprite, x, y: feet - sprite.rows.length });
  };
  for (let x = from - step; x > -step; x -= step) put(x);
  for (let x = to + 8; x < g.W; x += step) put(x);
  return out;
}

// --- Forge ---

/** Where the forge's wall meets its floor (scene pixels from the top). */
export function forgeFloor(g: SceneGeometry): number {
  return g.top + 74;
}

/** The forge's anvils (the job slots), chest, parts shelf and workbench, from its middle and floor. */
export function forgeSpots(g: SceneGeometry) {
  const f = forgeFloor(g);
  const x0 = g.cx - 64;
  return {
    anvils: [
      { x: x0 + 20, y: f + 14 },
      { x: x0 + 92, y: f + 14 },
    ],
    chest: { x: x0 + 110, y: f - 14 },
    shelf: { x: x0 + 2, y: f - 52 },
    bench: { x: x0 + 24, y: f + 50, width: 80 },
    fire: { x: x0 + 46, y: f - 35 },
  };
}

export function forgeDraw(g: SceneGeometry): Placement[] {
  const f = forgeFloor(g);
  const at = forgeSpots(g);
  const fire = ROOM_SPRITE_DATA.fireplace.day;
  return [
    ...band('stoneWall', g, 0, f, EMBER_STONE),
    ...band('dirt', g, f, g.H),
    ...(fire === undefined ? [] : [{ sprite: fire, x: at.fire.x, y: at.fire.y }]),
    ...plank(40, 4, at.shelf.x, at.shelf.y + 12),
    ...at.anvils.map((a) => ({ sprite: ANVIL, x: a.x, y: a.y })),
    ...plank(at.bench.width, 6, at.bench.x, at.bench.y + 10, 8),
    // A wide window: barrels, crates and buckets along the wall, and parts crates on the floor.
    ...sides(g, g.cx - 64, g.cx + 64, f + 2, 30, [
      propSprite('barrel', 0, 'wood', 'red'),
      propSprite('crate', 0, 'wood', 'red'),
      propSprite('bucket', 0, 'frost'),
      propSprite('crate', 0, 'pine', 'green'),
    ]),
    ...sides(g, g.cx - 72, g.cx + 72, f + 60, 44, [
      propSprite('teamCrate', 0, 'pine', 'red'),
      ANVIL,
      propSprite('barrel', 0, 'wood', 'blue'),
    ]),
  ];
}

// --- Arena ---

export function arenaSpots(g: SceneGeometry) {
  const top = g.top + 18;
  return {
    /** The boss's top-left (24 x 24) on the sand. */
    boss: { x: g.cx - 12, y: top + 4 },
    /** The board: three lines (front nearest the boss) of three seats, 20 px seats 26 px apart. */
    board: { x: g.cx - 36, y: top + 46, step: 26, seat: 20 },
  };
}

/** A seat on the sand: a rug in the sand's own darker tones with a chalk edge. */
function seat(x: number, y: number): Placement {
  const s = new PixelGrid(20, 20);
  s.rect(0, 0, 20, 20, 'd');
  s.rect(1, 1, 18, 18, 'c');
  for (let i = 2; i < 18; i += 4) {
    s.rect(i, 0, 2, 1, 'a');
    s.rect(i, 19, 2, 1, 'a');
    s.rect(0, i, 1, 2, 'a');
    s.rect(19, i, 1, 2, 'a');
  }
  return {
    sprite: s.toSprite({ a: RAMPS.sand[0], c: RAMPS.sand[2], d: RAMPS.sand[3] }),
    x,
    y,
  };
}

export function arenaDraw(g: SceneGeometry): Placement[] {
  const at = arenaSpots(g);
  const stands = g.top + 2;
  const seats: Placement[] = [];
  for (let line = 0; line < 3; line++) {
    for (let lane = 0; lane < 3; lane++) {
      seats.push(seat(at.board.x + lane * at.board.step, at.board.y + line * at.board.step));
    }
  }
  // The crowd: fans waving along the stands, in every team colour.
  const crowd: Placement[] = [];
  const colours = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
  for (let x = 4, i = 0; x < g.W; x += 14, i++) {
    crowd.push({
      sprite: propSprite('fan', i % 2, colours[i % colours.length]),
      x,
      y: stands + 2 + (i % 2) * 2,
    });
  }
  return [
    ...band('bleacher', g, 0, stands + TILE),
    ...band('bunting', g, stands - TILE, stands),
    ...band('sand', g, stands + TILE, g.H),
    ...crowd,
    ...seats,
    ...sides(g, at.board.x - 20, at.board.x + 3 * at.board.step + 20, at.board.y + 40, 36, [
      propSprite('pennant', 0, 'red'),
      propSprite('crate', 0, 'wood', 'red'),
      propSprite('pennant', 1, 'blue'),
      propSprite('barrel', 0, 'wood', 'green'),
    ]),
  ];
}

// --- House (the living room) ---

/** The room's left edge in the scene: a phone sees the couch and the table, a wide window all of it. */
export function roomLeft(g: SceneGeometry): number {
  return g.W >= 300 ? g.cx - 144 : g.cx - 92;
}

/** Where the room's strip ends and its floor goes on. */
export function houseFloor(g: SceneGeometry): number {
  return g.top + 50;
}

export function houseSpots(g: SceneGeometry) {
  const f = houseFloor(g);
  return {
    rug: { x: g.cx - 22, y: f + 40 },
    /** The creature that evolves, on the rug; its two forms either side. */
    centre: { x: g.cx - 8, y: f + 26 },
    left: { x: g.cx - 46, y: f + 26 },
    right: { x: g.cx + 30, y: f + 26 },
  };
}

export function houseDraw(phase: RoomPhase): (g: SceneGeometry) => Placement[] {
  return (g) => {
    const scene = roomScene(phase);
    const top = houseFloor(g) - 50;
    const left = roomLeft(g);
    const out: Placement[] = [];
    // The wall above the room and the wall and floor at its sides.
    for (let x = 0; x < g.W; x += 16) {
      out.push({ sprite: scene.edgeTile, x, y: top });
      out.push({ sprite: scene.edgeTile, x, y: top - 42 });
    }
    // The floor runs on down to the bottom: planks.
    out.push(...band('planks', g, top + 56, g.H, RAMPS.wood));
    for (const p of scene.props) {
      if (p.layer === 'back') out.push({ sprite: p.sprite, x: left + p.x, y: top + p.y });
    }
    out.push({ sprite: scene.trophy, x: left + 168, y: top + 17 });
    const rug = ROOM_SPRITE_DATA.rug.day;
    const at = houseSpots(g);
    if (rug !== undefined) out.push({ sprite: rug, x: at.rug.x, y: at.rug.y });
    return out;
  };
}

/** The room's front props (couch arms, the table): drawn over the creatures. */
export function houseFront(phase: RoomPhase, g: SceneGeometry): Placement[] {
  const top = houseFloor(g) - 50;
  const left = roomLeft(g);
  return roomScene(phase)
    .props.filter((p) => p.layer === 'front')
    .map((p) => ({ sprite: p.sprite, x: left + p.x, y: top + p.y }));
}

// --- Cave (the Dungeon) ---

export function caveSpots(g: SceneGeometry) {
  const x0 = g.cx - 64;
  const t = g.top + 6;
  return {
    landing: { x: x0 + 8, y: t + 18 },
    lantern: { x: x0 + 44, y: t + 26 },
    pack: { x: x0 + 108, y: t + 14 },
    stair: { x: x0 + 30, y: t + 34 },
    /** Where the dark (and today's map) begins. */
    dark: t + 82,
  };
}

/** A slate stair going down to the right into the dark: six steps of 12 x 8. */
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

export function caveDraw(g: SceneGeometry): Placement[] {
  const at = caveSpots(g);
  return [...band('stoneWall', g, 0, at.dark, SLATE), ...stair(at.stair.x, at.stair.y)];
}

// --- Fairground (the Valley Games) ---

export function fairDraw(g: SceneGeometry): Placement[] {
  const t = g.top;
  const wm = WORLD_MAP_SPRITE_DATA;
  return [
    ...band('sky', g, 0, t + 8),
    ...band('skyLow', g, t + 8, t + 24),
    ...band('hillsA', g, t + 8, t + 24),
    ...band('grass', g, t + 24, g.H),
    ...band('bunting', g, t + 4, t + 20),
    { sprite: wm.festivalGrounds, x: g.cx - 28, y: t + 14 },
    { sprite: propSprite('podium2', 0, 'silver'), x: g.cx - 70, y: t + 42 },
    { sprite: propSprite('podium1', 0, 'gold'), x: g.cx - 50, y: t + 36 },
    { sprite: propSprite('podium3', 0, 'bronze'), x: g.cx - 30, y: t + 46 },
    { sprite: wm.smallTree, x: g.cx + 40, y: t + 40 },
    { sprite: wm.smallPine, x: g.cx + 56, y: t + 36 },
  ];
}

// --- Paddock (your creatures) ---

export function paddockDraw(g: SceneGeometry): Placement[] {
  return [
    ...band('grass', g, 0, g.H),
    ...band('fence', g, g.top + 8, g.top + 24),
    { sprite: WORLD_MAP_SPRITE_DATA.smallTree, x: g.cx - 60, y: g.top + 40 },
    { sprite: WORLD_MAP_SPRITE_DATA.flowers, x: g.cx + 40, y: g.top + 90 },
    { sprite: WORLD_MAP_SPRITE_DATA.bush, x: g.cx + 50, y: g.top + 50 },
  ];
}
