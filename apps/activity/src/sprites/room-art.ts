/**
 * The living room as data: a 288x56 scene built from props (each a `SpriteDef` of at most 64x64) on a
 * `back` or `front` layer, plus the 16 spots where creatures sit. Draw order is: back props, the
 * creatures (lower `z` first), front props. The pixel data lives in `data/room-sprites.ts`.
 *
 * Reading the room from left to right it has five bays: a window with a sill, a couch, a table with two
 * chairs behind it, a fireplace on a rug, and a bookshelf with a beanbag. The top `ROOM_BAND_HEIGHT`
 * rows are a plain, calm wall band: the app's title row is laid over it, so keep it low contrast.
 * A spot is the top-left of a 16x16 creature sprite in room pixels; the creature's feet are on the
 * sprite's last row, so a spot's `y + 15` is the surface it stands or sits on.
 */
import type { RoomPhase } from '@creatures/game';
import { ROOM_SPRITE_DATA, type RoomPropName } from './data/room-sprites';
import type { SpriteDef } from './sprite-data';

export const ROOM_SIZE = { width: 288, height: 56 } as const;
/** The calm wall band at the top that the title row is laid over. */
export const ROOM_BAND_HEIGHT = 14;
/** The wall-and-floor tile that repeats seamlessly; it is as tall as the room. */
export const EDGE_TILE_WIDTH = 16;
export const SPOT_SIZE = { width: 16, height: 16 } as const;

export type RoomLayer = 'back' | 'front';

export interface RoomProp {
  sprite: SpriteDef;
  /** Top-left, in room pixels. */
  x: number;
  y: number;
  layer: RoomLayer;
}

export interface RoomSpot {
  id: string;
  /** Top-left of a 16x16 creature sprite, in room pixels. */
  x: number;
  y: number;
  /** Draw order among creatures: lower is further back. */
  z: number;
}

/** The room's lights, from the guild's local time (`roomPhase` in `@creatures/game`). */
export type { RoomPhase };

export interface RoomScene {
  /** Every prop of the room in this light, in draw order within each layer. */
  props: readonly RoomProp[];
  /** The repeating wall and floor tile (16 wide, as tall as the room). */
  edgeTile: SpriteDef;
  /** A small note on a cushion (16x16): shown in a spot when all of a player's creatures are out working. */
  note: SpriteDef;
}

/** The sprite of a prop in a phase. Every phase a prop is placed in has one (the tests check). */
function art(name: RoomPropName, phase: RoomPhase): SpriteDef {
  const sprite = ROOM_SPRITE_DATA[name][phase];
  if (sprite === undefined) throw new Error(`Room prop "${name}" has no ${phase} art.`);
  return sprite;
}

type Placement = readonly [name: RoomPropName, x: number, y: number, layer: RoomLayer];

/** Props that are drawn in every phase. */
const ALWAYS: readonly Placement[] = [
  // Bay 1: window with a sill, and a floor cushion
  ['window', 6, 15, 'back'],
  ['cushion', 28, 49, 'back'],
  // Bay 2: couch (back and seat top behind the creatures, arms and seat front before them)
  ['picture', 69, 16, 'back'],
  ['couchBack', 48, 24, 'back'],
  ['couchFront', 48, 32, 'front'],
  // Bay 3: table with two chairs behind it, a hanging lamp, and a stool
  ['lamp', 125, 14, 'back'],
  ['chair', 113, 25, 'back'],
  ['chair', 133, 25, 'back'],
  ['stool', 157, 50, 'back'],
  ['table', 112, 40, 'front'],
  ['plant', 171, 41, 'front'],
  // Bay 4: fireplace (lit in every phase) on a rug, and a pouf
  ['rug', 178, 47, 'back'],
  ['fireplace', 184, 15, 'back'],
  ['pouf', 222, 48, 'back'],
  ['poufFront', 222, 51, 'front'],
  // Bay 5: bookshelf with a lamp on top, a clock, and a beanbag
  ['tableLamp', 257, 20, 'back'],
  ['clock', 272, 18, 'back'],
  ['beanbag', 268, 44, 'back'],
  ['beanbagFront', 268, 48, 'front'],
];

/** Light that is drawn behind the furniture: lamp and fire glow when it is dim, daylight from the window. */
function lightProps(phase: RoomPhase): readonly Placement[] {
  const lamps: readonly Placement[] = [
    ['lampGlow', 117, 18, 'back'],
    ['fireGlow', 170, 15, 'back'],
    ['tableLampGlow', 252, 18, 'back'],
  ];
  const daylight: Placement = ['daylight', 6, 15, 'back'];
  if (phase === 'day') return [daylight];
  if (phase === 'twilight') return [daylight, ...lamps];
  return lamps;
}

/** Wall and floor across the whole room: 18 edge tiles side by side. */
function base(phase: RoomPhase): RoomProp[] {
  return Array.from({ length: ROOM_SIZE.width / EDGE_TILE_WIDTH }, (_, i) => ({
    sprite: art('edge', phase),
    x: i * EDGE_TILE_WIDTH,
    y: 0,
    layer: 'back' as const,
  }));
}

/**
 * The whole room in one light. The three scenes have the same furniture in the same places (and the
 * same `ROOM_SPOTS`); only the colours, the window's sky and the lamp, fire and daylight glows differ.
 * Light goes right after the wall so every piece of furniture is drawn over it.
 */
export function roomScene(phase: RoomPhase): RoomScene {
  const placements = [...lightProps(phase), ...ALWAYS];
  return {
    props: [
      ...base(phase),
      ...placements.map(([name, x, y, layer]) => ({ sprite: art(name, phase), x, y, layer })),
    ],
    edgeTile: art('edge', phase),
    note: art('note', phase),
  };
}

/**
 * The night room, from before the room had three lights. Kept so code written against the single
 * room still works; new code should call `roomScene(phase)`.
 */
export const ROOM_PROPS: readonly RoomProp[] = roomScene('night').props;
export const EDGE_TILE: SpriteDef = roomScene('night').edgeTile;
export const NOTE_ON_CUSHION: SpriteDef = roomScene('night').note;

/** The 16 places a creature can sit, spread across the five bays. */
export const ROOM_SPOTS: readonly RoomSpot[] = [
  // Bay 1: window
  { id: 'window-sill', x: 16, y: 22, z: 22 },
  { id: 'window-floor', x: 2, y: 40, z: 40 },
  { id: 'window-cushion', x: 30, y: 35, z: 35 },
  // Bay 2: couch
  { id: 'couch-left', x: 56, y: 28, z: 28 },
  { id: 'couch-middle', x: 72, y: 28, z: 28 },
  { id: 'couch-right', x: 88, y: 28, z: 28 },
  // Bay 3: table
  { id: 'table-chair-left', x: 114, y: 27, z: 27 },
  { id: 'table-chair-right', x: 134, y: 27, z: 27 },
  { id: 'table-stool', x: 156, y: 35, z: 35 },
  // Bay 4: fireplace
  { id: 'fire-mantel', x: 194, y: 15, z: 15 },
  { id: 'fire-rug-left', x: 180, y: 39, z: 39 },
  { id: 'fire-rug-right', x: 208, y: 39, z: 39 },
  { id: 'fire-pouf', x: 220, y: 36, z: 36 },
  // Bay 5: bookshelf
  { id: 'shelf-top', x: 240, y: 15, z: 15 },
  { id: 'shelf-floor', x: 244, y: 40, z: 40 },
  { id: 'shelf-beanbag', x: 270, y: 34, z: 34 },
];
