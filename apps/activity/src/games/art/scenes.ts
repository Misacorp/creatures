/**
 * The Valley Games scenes as data: each is 192x112 scene pixels built from tilemaps and props on a
 * `back` and a `front` layer, with named anchors where the playback puts its actors. Every anchor is a
 * creature's feet-centre in scene pixels: a 16x16 creature sprite is drawn with its top-left at
 * (x - 8, y - 16), so its last row rests on the line y.
 *
 * The geometry is fixed (the engine and the playback agree on it):
 *
 * - `sauna` and `frost-bath`: an upper bench (feet y 60) and a lower one (feet y 84), seats x 40 to 176
 *   in steps of 17; the stove (an ice block in the cold plunge) on the left, x 4 to 30; the door on the
 *   right, which an actor leaves by walking to (186, 100); a thermometer on the wall showing `heat`.
 * - `pepper-table`: a back table (feet y 56) and a front one (feet y 88), seats x 24 to 168 in steps of
 *   18; the table fronts are on the front layer, so the eaters stand behind them.
 * - `melon-hill`: a sunny hillside path whose columns repeat sideways (`sceneWidthFor`), lanes from
 *   y 50 to 100; the melon comes from the left.
 * - `log-trail` and `pumpkin-hill` (the hauls): the same hillside path, with spare logs stacked by the
 *   fence or the committee's pumpkin patch on the slope behind it; the lanes run from y 48 to 100.
 * - `barrel-pond`, `crate-yard` and `kite-hill` (the at-once team events): a fixed view (no camera)
 *   with a column per team across it, up to 16 (`TEAM_COLUMNS`): a meadow with the barrels' feet at
 *   y 50 and a pond along the bottom (dips at y 94); a yard where the towers stand at y 94 and the
 *   crowd at y 104; an open hillside with a wide sky, the kite holders at y 98 and their crews at 106.
 * - `shark-lake`: a lake with an elliptical swim track (centre 96, 62; radii 72 x 34), sand all round
 *   and a beach at the bottom (y 104) where knocked-out swimmers land.
 * - `ice-floe`: icy water with a floe at (96, 62) drawn from its radius (`floeRadius`, ry = rx * 0.52),
 *   which shrinks each tick.
 *
 * Each scene also has a stands strip (192x48): a crowd and bunting above a front bench where up to
 * about fifteen player creatures sit in a row (`standsSeats`).
 */
import {
  FLOE_CENTRE,
  FLOE_MAX_RADIUS,
  THERMO_TUBE,
  TRACK,
  floePlacements,
  floeRy,
  garland,
  ropeEllipse,
  thermometerFill,
  trackPoint,
} from './drawn';
import type { Placement } from './pixel';
import { propSprite, type PropName } from './props';
import { TILE, tilemapPlacements, type Tilemap } from './tiles';
import { TEAM_RAMPS, mutedRamp, type RampName } from './tint';

export const SCENE_SIZE = { width: 192, height: 112 } as const;
export const STANDS_SIZE = { width: 192, height: 48 } as const;
/** A creature sprite's size; anchors are its feet-centre. */
export const ACTOR_SIZE = 16;

export const GAMES_SCENE_IDS = [
  'sauna',
  'frost-bath',
  'pepper-table',
  'melon-hill',
  'shark-lake',
  'ice-floe',
  'log-trail',
  'pumpkin-hill',
  'barrel-pond',
  'crate-yard',
  'kite-hill',
] as const;
export type GamesSceneId = (typeof GAMES_SCENE_IDS)[number];

export type SceneLayer = 'back' | 'front';

export interface ScenePoint {
  x: number;
  y: number;
}

/** What changes while a scene plays: the animation frame and the event's own numbers. */
export interface SceneState {
  /** The idle animation tick (water, steam, the crowd); 0 when still. */
  frame?: number | undefined;
  /** The sauna's heat, 0 to 100 (the thermometer). */
  heat?: number | undefined;
  /** The floe's horizontal radius in scene pixels. */
  floeRadius?: number | undefined;
  /** How wide to draw a scene that repeats sideways (scene pixels); others ignore it. */
  width?: number | undefined;
}

export interface SceneLayers {
  width: number;
  height: number;
  back: Placement[];
  front: Placement[];
}

export interface GamesSceneArt {
  id: GamesSceneId;
  /** The scene's named anchors (feet-centres), all inside 192x112. */
  anchors: Readonly<Record<string, readonly ScenePoint[]>>;
  /** Every tilemap the scene draws, with its layer (the tests check their keys). */
  tilemaps: readonly { map: Tilemap; layer: SceneLayer }[];
  /** The scene's layers in a state. */
  layers: (state?: SceneState) => SceneLayers;
  /** The stands strip that goes with it. */
  stands: (state?: SceneState) => SceneLayers;
}

/** A prop placed in a scene: by name, at its top-left, on a layer, maybe tinted, maybe animated. */
interface PropPlacement {
  prop: PropName;
  x: number;
  y: number;
  layer: SceneLayer;
  tint?: RampName | undefined;
  tint2?: RampName | undefined;
  /** Added to the frame, so neighbours do not move in step. */
  phase?: number | undefined;
  /** Ticks per animation frame (slower props). */
  every?: number | undefined;
}

function place(p: PropPlacement, frame: number): Placement {
  const f = Math.floor(frame / (p.every ?? 1)) + (p.phase ?? 0);
  return { sprite: propSprite(p.prop, f, p.tint, p.tint2), x: p.x, y: p.y };
}

function seatRow(from: number, to: number, step: number, y: number): ScenePoint[] {
  const out: ScenePoint[] = [];
  for (let x = from; x <= to; x += step) out.push({ x, y });
  return out;
}

/** A row of `n` copies of a tile key. */
function run(key: string, n: number): string {
  return key.repeat(n);
}

const COLS = SCENE_SIZE.width / TILE;
const WATER_EVERY = 3;

// ---------------------------------------------------------------------------------------------
// The stands

interface StandsTheme {
  backdrop: Tilemap;
  seat: RampName;
  riser: RampName;
  crowd: readonly RampName[];
  bunting: readonly RampName[];
}

/** Where the players' creatures sit in the stands (their feet), evenly spread, up to about fifteen. */
export const STANDS_FEET_Y = 38;

export function standsSeats(count: number): ScenePoint[] {
  const n = Math.max(0, Math.min(16, Math.floor(count)));
  if (n === 0) return [];
  const span = STANDS_SIZE.width - 2 * 12;
  const step = n === 1 ? 0 : Math.min(16, span / (n - 1));
  const width = step * (n - 1);
  const start = Math.round(STANDS_SIZE.width / 2 - width / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(start + i * step),
    y: STANDS_FEET_Y,
  }));
}

function standsMaps(theme: StandsTheme): { map: Tilemap; layer: SceneLayer }[] {
  const step: Tilemap = {
    rows: [run('B', COLS)],
    legend: { B: { tile: 'bleacher', tint: theme.seat, tint2: mutedRamp(theme.riser) } },
  };
  return [
    { map: theme.backdrop, layer: 'back' },
    { map: { ...step, y: 20 }, layer: 'back' },
    { map: { ...step, y: 36 }, layer: 'back' },
  ];
}

function buildStands(theme: StandsTheme, state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const back: Placement[] = [];
  for (const { map } of standsMaps(theme).slice(0, 2))
    back.push(...tilemapPlacements(map, { frame }));
  // The crowd on the back step, a wave running along it.
  const fans = Math.floor((STANDS_SIZE.width - 4) / 10);
  for (let i = 0; i < fans; i++) {
    const tint = theme.crowd[(i * 3 + Math.floor(i / 8)) % theme.crowd.length] ?? 'blue';
    const up = (i + Math.floor(frame / 2)) % 6 === 0;
    back.push({ sprite: propSprite('fan', up ? 1 : 0, tint), x: 2 + i * 10, y: 10 + (i % 2) });
  }
  back.push(...garland(0, STANDS_SIZE.width - 1, 0, 6, theme.bunting));
  const front = tilemapPlacements(standsMaps(theme)[2]?.map ?? { rows: [], legend: {} }, { frame });
  // The front step is behind the seated players: it is drawn on the back layer.
  return {
    width: STANDS_SIZE.width,
    height: STANDS_SIZE.height,
    back: [...back, ...front],
    front: [],
  };
}

const INDOOR_BACKDROP: Tilemap = {
  rows: [run('w', COLS), run('w', COLS)],
  legend: { w: { tile: 'woodWall', tint: 'night' } },
};
const OUTDOOR_BACKDROP: Tilemap = {
  rows: [run('s', COLS), run('l', COLS)],
  legend: { s: { tile: 'sky' }, l: { tile: 'skyLow' } },
};

// ---------------------------------------------------------------------------------------------
// Sauna and cold plunge

export const SAUNA_UPPER_Y = 60;
export const SAUNA_LOWER_Y = 84;
export const SAUNA_SEATS_X = { from: 40, to: 176, step: 17 } as const;
export const SAUNA_EXIT: ScenePoint = { x: 186, y: 100 };
/** Where the thermometer hangs (its top-left), so the playback can point at it. */
export const SAUNA_THERMOMETER = { x: 19, y: 4 } as const;

interface SaunaTheme {
  wall: RampName;
  bench: RampName;
  floor: Tilemap['legend'][string];
  heater: 'stove' | 'iceBlock';
  window: 'window' | 'frostyWindow';
  door: RampName;
  mercury: RampName;
  plaque: RampName;
  bucket: RampName;
  bunting: readonly RampName[];
  frost: boolean;
}

function benchMaps(theme: SaunaTheme): Tilemap[] {
  const legend = {
    L: { tile: 'benchSeatL', tint: theme.bench },
    M: { tile: 'benchSeat', tint: theme.bench },
    R: { tile: 'benchSeatR', tint: theme.bench },
    l: { tile: 'benchSkirtL', tint: theme.bench },
    m: { tile: 'benchSkirt', tint: theme.bench },
    r: { tile: 'benchSkirtR', tint: theme.bench },
  } as const;
  const rows = [`L${run('M', 7)}R`, `l${run('m', 7)}r`];
  return [
    { rows, legend, x: 33, y: SAUNA_UPPER_Y - 3 },
    { rows, legend, x: 33, y: SAUNA_LOWER_Y - 3 },
  ];
}

function saunaMaps(theme: SaunaTheme): { map: Tilemap; layer: SceneLayer }[] {
  const wall: Tilemap = {
    rows: Array.from({ length: 7 }, () => run('W', COLS)),
    legend: { W: { tile: 'woodWall', tint: theme.wall } },
  };
  const floor: Tilemap = { rows: [run('F', COLS)], legend: { F: theme.floor }, y: 98 };
  const [upper, lower] = benchMaps(theme);
  const maps: { map: Tilemap; layer: SceneLayer }[] = [{ map: wall, layer: 'back' }];
  if (upper !== undefined) maps.push({ map: upper, layer: 'back' });
  if (lower !== undefined) maps.push({ map: lower, layer: 'back' });
  maps.push({ map: floor, layer: 'back' });
  return maps;
}

function buildSauna(theme: SaunaTheme, state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const heat = Math.max(0, Math.min(100, state.heat ?? 0));
  const maps = saunaMaps(theme);
  const back: Placement[] = [];
  const [wall, upper, lower, floor] = maps;
  if (wall !== undefined) back.push(...tilemapPlacements(wall.map, { frame }));
  const props: PropPlacement[] = [];
  props.push({ prop: theme.window, x: 112, y: 14, layer: 'back' });
  props.push({ prop: 'door', x: 176, y: 54, layer: 'back', tint: theme.door });
  if (theme.heater === 'stove') {
    props.push({ prop: 'stovePipe', x: 13, y: -10, layer: 'back' });
    props.push({ prop: 'stovePipe', x: 13, y: 26, layer: 'back' });
  }
  props.push({
    prop: 'thermometer',
    ...SAUNA_THERMOMETER,
    layer: 'back',
    tint: theme.plaque,
    tint2: theme.mercury,
  });
  for (const p of props) back.push(place(p, frame));
  back.push({
    sprite: thermometerFill(heat, theme.mercury),
    x: SAUNA_THERMOMETER.x + THERMO_TUBE.x,
    y: SAUNA_THERMOMETER.y + THERMO_TUBE.y,
  });
  if (upper !== undefined) back.push(...tilemapPlacements(upper.map, { frame }));
  if (lower !== undefined) back.push(...tilemapPlacements(lower.map, { frame }));
  if (floor !== undefined) back.push(...tilemapPlacements(floor.map, { frame }));
  if (theme.heater === 'stove')
    back.push(place({ prop: 'stove', x: 3, y: 60, layer: 'back' }, frame));
  else back.push(place({ prop: 'iceBlock', x: 3, y: 68, layer: 'back' }, frame));
  if (theme.frost) {
    for (let x = 0; x < SCENE_SIZE.width; x += 16) {
      back.push(place({ prop: 'icicles', x, y: 0, layer: 'back' }, frame));
    }
    back.push(place({ prop: 'snowCap', x: 33, y: SAUNA_UPPER_Y - 6, layer: 'back' }, frame));
    back.push(place({ prop: 'snowCap', x: 161, y: SAUNA_LOWER_Y - 6, layer: 'back' }, frame));
  }
  back.push(...garland(0, SCENE_SIZE.width - 1, theme.frost ? 6 : 0, 7, theme.bunting));
  // Steam (or cold mist) over the heater: more of it as the heat rises.
  const puffs = heat >= 80 ? 3 : heat >= 45 ? 2 : 1;
  const steam: PropPlacement[] = [
    { prop: 'steam', x: 6, y: theme.frost ? 50 : 44, layer: 'front', every: 2 },
    { prop: 'steam', x: 12, y: theme.frost ? 40 : 32, layer: 'front', every: 2, phase: 1 },
    { prop: 'steam', x: 2, y: theme.frost ? 30 : 22, layer: 'front', every: 2, phase: 2 },
  ];
  const front: Placement[] = steam.slice(0, puffs).map((p) => place(p, frame));
  front.push(place({ prop: 'bucket', x: 23, y: 86, layer: 'front', tint: theme.bucket }, frame));
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front };
}

function saunaAnchors(): Record<string, ScenePoint[]> {
  const { from, to, step } = SAUNA_SEATS_X;
  return {
    upper: seatRow(from, to, step, SAUNA_UPPER_Y),
    lower: seatRow(from, to, step, SAUNA_LOWER_Y),
    exit: [SAUNA_EXIT],
    door: [{ x: 184, y: 98 }],
    heater: [{ x: 16, y: 98 }],
    thermometer: [{ x: SAUNA_THERMOMETER.x + 5, y: SAUNA_THERMOMETER.y + 38 }],
  };
}

const SAUNA_THEME: SaunaTheme = {
  wall: 'sauna',
  bench: 'pine',
  floor: { tile: 'planks', tint: 'wood' },
  heater: 'stove',
  window: 'window',
  door: 'wood',
  mercury: 'red',
  plaque: 'wood',
  bucket: 'wood',
  bunting: ['red', 'yellow', 'orange', 'pink'],
  frost: false,
};

const FROST_THEME: SaunaTheme = {
  wall: 'frost',
  bench: 'pine',
  floor: { tile: 'snow' },
  heater: 'iceBlock',
  window: 'frostyWindow',
  door: 'frost',
  mercury: 'tide',
  plaque: 'frost',
  bucket: 'frost',
  bunting: ['tide', 'teal', 'purple', 'ghost'],
  frost: true,
};

// ---------------------------------------------------------------------------------------------
// The pepper table

export const PEPPER_BACK_Y = 56;
export const PEPPER_FRONT_Y = 88;
export const PEPPER_SEATS_X = { from: 24, to: 168, step: 18 } as const;
/** The table cloth's top edge for each row of eaters (a creature's lower part is behind it). */
export const PEPPER_TABLE_TOP = { back: 54, front: 86 } as const;

function pepperMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const room: Tilemap = {
    rows: [
      ...Array.from({ length: 4 }, () => 'RCRCRCRCRCRC'),
      ...Array.from({ length: 3 }, () => run('P', COLS)),
    ],
    legend: {
      R: { tile: 'woodWall', tint: 'red' },
      C: { tile: 'woodWall', tint: 'cream' },
      P: { tile: 'planks', tint: 'wood' },
    },
  };
  const table = (y: number): Tilemap => ({
    rows: [`L${run('M', 9)}R`],
    legend: {
      L: { tile: 'clothL', tint: 'red' },
      M: { tile: 'cloth', tint: 'red' },
      R: { tile: 'clothR', tint: 'red' },
    },
    x: 8,
    y,
  });
  return [
    { map: room, layer: 'back' },
    { map: table(PEPPER_TABLE_TOP.back), layer: 'front' },
    { map: table(PEPPER_TABLE_TOP.front), layer: 'front' },
  ];
}

function buildPepper(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const [room, backTable, frontTable] = pepperMaps();
  const back: Placement[] = room === undefined ? [] : tilemapPlacements(room.map, { frame });
  // A shadow line where the wall meets the floor.
  const props: PropPlacement[] = [
    { prop: 'scoreboard', x: 72, y: 4, layer: 'back', every: 2 },
    { prop: 'hostDesk', x: 4, y: 14, layer: 'back' },
    { prop: 'pennant', x: 46, y: 18, layer: 'back', tint: 'yellow', every: 3 },
    { prop: 'pennant', x: 138, y: 18, layer: 'back', tint: 'green', every: 3, phase: 1 },
    { prop: 'trophy', x: 160, y: 22, layer: 'back' },
  ];
  for (const p of props) back.push(place(p, frame));
  back.push(...garland(0, SCENE_SIZE.width - 1, 0, 5, ['yellow', 'green', 'orange', 'teal']));
  const front: Placement[] = [];
  if (backTable !== undefined) front.push(...tilemapPlacements(backTable.map, { frame }));
  if (frontTable !== undefined) front.push(...tilemapPlacements(frontTable.map, { frame }));
  front.push(place({ prop: 'crate', x: 0, y: 98, layer: 'front' }, frame));
  front.push(
    place({ prop: 'crate', x: 174, y: 98, layer: 'front', tint: 'pine', tint2: 'green' }, frame),
  );
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front };
}

function pepperAnchors(): Record<string, ScenePoint[]> {
  const { from, to, step } = PEPPER_SEATS_X;
  const back = seatRow(from, to, step, PEPPER_BACK_Y);
  const front = seatRow(from, to, step, PEPPER_FRONT_Y);
  return {
    back,
    front,
    // Where a plate rests on the table in front of each eater (the plate's bottom-centre).
    backPlates: back.map((p) => ({ x: p.x, y: PEPPER_TABLE_TOP.back + 3 })),
    frontPlates: front.map((p) => ({ x: p.x, y: PEPPER_TABLE_TOP.front + 3 })),
    host: [{ x: 21, y: 40 }],
    crate: [{ x: 9, y: 111 }],
  };
}

// ---------------------------------------------------------------------------------------------
// The melon hill (repeats sideways)

/** The width of one repeat of the hill: poles, clouds and the tilemap all repeat on it. */
export const MELON_PERIOD = 96;
export const MELON_LANES: readonly number[] = [50, 60, 70, 80, 90, 100];
export const MELON_START: ScenePoint = { x: 18, y: 92 };

/** The world width to draw for a run of `px` scene pixels: at least the screen, whole repeats. */
export function sceneWidthFor(px: number): number {
  const wanted = Math.max(SCENE_SIZE.width, Math.ceil(px));
  return Math.ceil(wanted / MELON_PERIOD) * MELON_PERIOD;
}

function melonMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const base: Tilemap = {
    rows: ['SSSSSS', 'LLLLLL', 'EEEEEE', 'DDDDDD', 'DDDDDD', 'DDDDDD', 'TTTTTT'],
    legend: {
      S: { tile: 'sky' },
      L: { tile: 'skyLow' },
      E: { tile: 'grassEdge' },
      D: { tile: 'dirt' },
      T: { tile: 'grassEdgeTop' },
    },
    repeatX: true,
  };
  const farHills: Tilemap = {
    rows: ['ab'],
    legend: { a: { tile: 'hillsA', tint: 'ice' }, b: { tile: 'hillsB', tint: 'ice' } },
    x: -10,
    y: 8,
    repeatX: true,
  };
  const hills: Tilemap = {
    rows: ['ab'],
    legend: { a: { tile: 'hillsA' }, b: { tile: 'hillsB' } },
    y: 16,
    repeatX: true,
  };
  const fence: Tilemap = { rows: ['f'], legend: { f: { tile: 'fence' } }, y: 27, repeatX: true };
  return [
    { map: base, layer: 'back' },
    { map: farHills, layer: 'back' },
    { map: hills, layer: 'back' },
    { map: fence, layer: 'back' },
  ];
}

/** What a variant of the hill adds behind the fence: nothing, stacked logs or a pumpkin patch. */
type HillDressing = 'none' | 'logs' | 'pumpkins';

function buildMelon(state: SceneState): SceneLayers {
  return buildHill(state, 'none');
}

function buildHill(state: SceneState, dressing: HillDressing): SceneLayers {
  const frame = state.frame ?? 0;
  const width = sceneWidthFor(state.width ?? SCENE_SIZE.width);
  const back: Placement[] = [];
  const maps = melonMaps();
  const [base, far, hills, fence] = maps;
  if (base !== undefined) back.push(...tilemapPlacements(base.map, { frame, width }));
  back.push(place({ prop: 'sun', x: 150, y: 2, layer: 'back' }, frame));
  for (let x = 0, i = 0; x < width; x += MELON_PERIOD, i++) {
    back.push(
      place(
        { prop: 'cloud', x: x + (i % 2 === 0 ? 14 : 52), y: i % 2 === 0 ? 3 : 9, layer: 'back' },
        frame,
      ),
    );
  }
  if (far !== undefined) back.push(...tilemapPlacements(far.map, { frame, width: width + 10 }));
  if (hills !== undefined) back.push(...tilemapPlacements(hills.map, { frame, width }));
  // Bunting poles behind the fence, with garlands between them.
  for (let x = 0, i = 0; x < width; x += MELON_PERIOD, i++) {
    back.push(place({ prop: 'pole', x: x + 2, y: 8, layer: 'back' }, frame));
    back.push(
      ...garland(
        x + 5,
        x + MELON_PERIOD + 2,
        10,
        8,
        i % 2 === 0 ? ['red', 'yellow', 'blue'] : ['green', 'pink', 'orange'],
      ),
    );
  }
  for (let x = 0, i = 0; x < width; x += MELON_PERIOD, i++) {
    if (dressing === 'logs') {
      // A woodpile behind the fence: two logs with one on top.
      back.push(place({ prop: 'log', x: x + 40, y: 30, layer: 'back' }, 0));
      back.push(
        place({ prop: 'log', x: x + 58, y: 30, layer: 'back', tint: 'wood', tint2: 'pine' }, 0),
      );
      back.push(place({ prop: 'log', x: x + 49, y: 25, layer: 'back' }, 0));
    } else if (dressing === 'pumpkins') {
      // The pumpkin patch on the slope, half behind the fence: next year's racers.
      back.push(
        place(
          {
            prop: 'pumpkin',
            x: x + 44,
            y: 22,
            layer: 'back',
            tint: i % 2 === 0 ? 'orange' : 'yellow',
            tint2: 'grove',
          },
          i % 3,
        ),
      );
    }
  }
  if (fence !== undefined) back.push(...tilemapPlacements(fence.map, { frame, width }));
  // The start: a flag at the left end, where the melon comes from.
  back.push(place({ prop: 'finishFlag', x: 2, y: 22, layer: 'back', every: 3 }, frame));
  const front: Placement[] = [];
  return { width, height: SCENE_SIZE.height, back, front };
}

/** A haul's lanes (feet y): the top and bottom lane, the engine's numbers. */
export const HAUL_LANES = { top: 48, bottom: 100 } as const;

function haulAnchors(): Record<string, ScenePoint[]> {
  return {
    lanes: [HAUL_LANES.top, 74, HAUL_LANES.bottom].map((y) => ({ x: 40, y })),
    start: [{ x: 40, y: 74 }],
  };
}

function melonAnchors(): Record<string, ScenePoint[]> {
  return {
    lanes: MELON_LANES.map((y) => ({ x: 48, y })),
    melon: [MELON_START],
    start: [{ x: 40, y: 75 }],
  };
}

// ---------------------------------------------------------------------------------------------
// The shark lake

export const LAKE_SHORE_Y = 104;
export { TRACK, trackPoint };

function lakeMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const middle = `w${run('~', COLS - 2)}e`;
  const base: Tilemap = {
    rows: [
      `A${run('n', COLS - 2)}B`,
      middle,
      middle,
      middle,
      middle,
      middle,
      `C${run('s', COLS - 2)}D`,
      run('.', COLS),
    ],
    legend: {
      A: { tile: 'shoreNW' },
      B: { tile: 'shoreNE' },
      C: { tile: 'shoreSW' },
      D: { tile: 'shoreSE' },
      n: { tile: 'shoreN' },
      s: { tile: 'shoreS' },
      w: { tile: 'shoreW' },
      e: { tile: 'shoreE' },
      '~': { tile: 'water' },
    },
    y: -6,
  };
  const beach: Tilemap = { rows: [run('S', COLS)], legend: { S: { tile: 'sand' } }, y: 106 };
  return [
    { map: base, layer: 'back' },
    { map: beach, layer: 'back' },
  ];
}

function buildLake(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const waterFrame = Math.floor(frame / WATER_EVERY);
  const back: Placement[] = [];
  for (const { map } of lakeMaps()) back.push(...tilemapPlacements(map, { frame: waterFrame }));
  back.push(
    ...ropeEllipse({ cx: TRACK.cx, cy: TRACK.cy, rx: TRACK.rx - 16, ry: TRACK.ry - 14 }, 'red'),
  );
  const props: PropPlacement[] = [
    { prop: 'duck', x: 88, y: 56, layer: 'back' },
    { prop: 'buoy', x: 4, y: 52, layer: 'back' },
    { prop: 'buoy', x: 180, y: 52, layer: 'back', tint: 'orange' },
    { prop: 'buoy', x: 30, y: 18, layer: 'back', tint: 'yellow' },
    { prop: 'buoy', x: 154, y: 18, layer: 'back', tint: 'yellow' },
    { prop: 'reeds', x: 1, y: 92, layer: 'back' },
    { prop: 'reeds', x: 183, y: 90, layer: 'back' },
    { prop: 'reeds', x: 2, y: 0, layer: 'back' },
    { prop: 'finishFlag', x: 112, y: 82, layer: 'back', every: 3 },
  ];
  for (const p of props) back.push(place(p, frame));
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front: [] };
}

function lakeAnchors(): Record<string, ScenePoint[]> {
  return {
    track: Array.from({ length: 24 }, (_, i) => trackPoint(i / 24)),
    start: [trackPoint(0)],
    shore: seatRow(16, 176, 16, LAKE_SHORE_Y),
  };
}

// ---------------------------------------------------------------------------------------------
// The ice floe

export const FLOE_DEFAULT_RADIUS = 80;
export { FLOE_CENTRE, FLOE_MAX_RADIUS, floeRy };

function floeMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const sea: Tilemap = {
    rows: Array.from({ length: 7 }, () => run('~', COLS)),
    legend: { '~': { tile: 'deepWater', tint: 'arctic' } },
  };
  return [{ map: sea, layer: 'back' }];
}

function buildFloe(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const back: Placement[] = [];
  for (const { map } of floeMaps())
    back.push(...tilemapPlacements(map, { frame: Math.floor(frame / WATER_EVERY) }));
  const chunks: PropPlacement[] = [
    { prop: 'iceChunk', x: 4, y: 6, layer: 'back' },
    { prop: 'iceChunk', x: 172, y: 12, layer: 'back' },
    { prop: 'iceChunk', x: 2, y: 100, layer: 'back' },
    { prop: 'iceChunk', x: 176, y: 102, layer: 'back' },
    { prop: 'iceChunk', x: 92, y: 2, layer: 'back' },
  ];
  for (const p of chunks) {
    const bob = Math.floor(frame / 4 + p.x) % 2;
    back.push({ ...place(p, frame), y: p.y + bob });
  }
  back.push(...floePlacements(state.floeRadius ?? FLOE_DEFAULT_RADIUS));
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front: [] };
}

/**
 * Standing spots on the floe at a radius: two rings round the centre (feet-centres), a little below it
 * so the creatures' bodies stand over the middle of the ice.
 */
export function floeSpots(rx: number, count = 12): ScenePoint[] {
  const ry = floeRy(rx);
  return Array.from({ length: count }, (_, i) => {
    const ring = i % 2 === 0 ? 0.62 : 0.3;
    const a = (i / count) * 2 * Math.PI;
    return {
      x: Math.round(FLOE_CENTRE.x + Math.cos(a) * rx * ring),
      y: Math.round(FLOE_CENTRE.y + ry * 0.2 + Math.sin(a) * ry * ring),
    };
  });
}

function floeAnchors(): Record<string, ScenePoint[]> {
  return {
    centre: [{ x: FLOE_CENTRE.x, y: FLOE_CENTRE.y }],
    spots: floeSpots(FLOE_DEFAULT_RADIUS),
    // Where a shoved creature splashes down, round the outside of the widest floe.
    splash: Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * 2 * Math.PI;
      return {
        x: Math.round(FLOE_CENTRE.x + Math.cos(a) * 88),
        y: Math.max(16, Math.min(110, Math.round(FLOE_CENTRE.y + 10 + Math.sin(a) * 48))),
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// The at-once team events: the barrels by the pond, the crate yard, the kite hill (fixed views)

/** Where the team columns sit: up to 16 across the scene (the engine's `columnXs`). */
export const TEAM_COLUMNS = { left: 8, right: 184, max: 16 } as const;
export const POND_TOP_Y = 80;
export const BARREL_FEET_Y = 46;
export const YARD_BASE_Y = 94;
export const KITE_GROUND_Y = 88;

function teamAnchors(feet: readonly number[]): Record<string, ScenePoint[]> {
  return {
    columns: [TEAM_COLUMNS.left + 5, 96, TEAM_COLUMNS.right - 5].map((x) => ({
      x,
      y: feet[0] ?? 90,
    })),
    feet: feet.map((y) => ({ x: 96, y })),
  };
}

function skyRows(n: number): string[] {
  return Array.from({ length: n }, (_, i) => run(i === n - 1 ? 'l' : 's', COLS));
}

function pondMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const base: Tilemap = {
    rows: [
      ...skyRows(2),
      run('g', COLS),
      run('g', COLS),
      run('g', COLS),
      run('n', COLS),
      run('~', COLS),
    ],
    legend: {
      s: { tile: 'sky' },
      l: { tile: 'skyLow' },
      g: { tile: 'grass' },
      n: { tile: 'shoreN', tint2: 'grass' },
      '~': { tile: 'water' },
    },
  };
  const hills: Tilemap = {
    rows: [run('ab', COLS / 2)],
    legend: { a: { tile: 'hillsA' }, b: { tile: 'hillsB' } },
    y: 16,
  };
  const fence: Tilemap = { rows: [run('f', COLS)], legend: { f: { tile: 'fence' } }, y: 24 };
  return [
    { map: base, layer: 'back' },
    { map: hills, layer: 'back' },
    { map: fence, layer: 'back' },
  ];
}

function buildPond(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const waterFrame = Math.floor(frame / WATER_EVERY);
  const back: Placement[] = [];
  const [base, hills, fence] = pondMaps();
  if (base !== undefined) back.push(...tilemapPlacements(base.map, { frame: waterFrame }));
  back.push(place({ prop: 'sun', x: 160, y: 1, layer: 'back' }, frame));
  back.push(place({ prop: 'cloud', x: 20, y: 3, layer: 'back' }, frame));
  back.push(place({ prop: 'cloud', x: 104, y: 8, layer: 'back' }, frame));
  if (hills !== undefined) back.push(...tilemapPlacements(hills.map, { frame }));
  if (fence !== undefined) back.push(...tilemapPlacements(fence.map, { frame }));
  back.push(...garland(0, SCENE_SIZE.width - 1, 22, 6, ['blue', 'yellow', 'teal']));
  const props: PropPlacement[] = [
    { prop: 'reeds', x: 0, y: 80, layer: 'back' },
    { prop: 'reeds', x: 182, y: 82, layer: 'back' },
    { prop: 'duck', x: 150, y: 101, layer: 'back' },
    { prop: 'bucket', x: 2, y: 64, layer: 'back', tint: 'wood' },
  ];
  for (const p of props) back.push(place(p, frame));
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front: [] };
}

function yardMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const base: Tilemap = {
    rows: [
      ...skyRows(2),
      run('g', COLS),
      run('g', COLS),
      run('g', COLS),
      run('E', COLS),
      run('D', COLS),
    ],
    legend: {
      s: { tile: 'sky' },
      l: { tile: 'skyLow' },
      g: { tile: 'grass' },
      E: { tile: 'grassEdge' },
      D: { tile: 'dirt' },
    },
  };
  const hills: Tilemap = {
    rows: [run('ab', COLS / 2)],
    legend: { a: { tile: 'hillsA', tint: 'ice' }, b: { tile: 'hillsB', tint: 'ice' } },
    y: 14,
  };
  const fence: Tilemap = { rows: [run('f', COLS)], legend: { f: { tile: 'fence' } }, y: 24 };
  return [
    { map: base, layer: 'back' },
    { map: hills, layer: 'back' },
    { map: fence, layer: 'back' },
  ];
}

function buildYard(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const back: Placement[] = [];
  const [base, hills, fence] = yardMaps();
  if (base !== undefined) back.push(...tilemapPlacements(base.map, { frame }));
  back.push(place({ prop: 'sun', x: 8, y: 2, layer: 'back' }, frame));
  back.push(place({ prop: 'cloud', x: 120, y: 4, layer: 'back' }, frame));
  if (hills !== undefined) back.push(...tilemapPlacements(hills.map, { frame }));
  if (fence !== undefined) back.push(...tilemapPlacements(fence.map, { frame }));
  back.push(...garland(0, SCENE_SIZE.width - 1, 22, 6, ['orange', 'green', 'yellow']));
  // The committee's spare crates by the fence.
  for (const [x, y] of [
    [30, 34],
    [40, 34],
    [35, 29],
    [150, 34],
    [160, 34],
  ] as const) {
    back.push(place({ prop: 'teamCrate', x, y, layer: 'back', tint: 'pine', tint2: 'wood' }, 0));
  }
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front: [] };
}

function kiteHillMaps(): { map: Tilemap; layer: SceneLayer }[] {
  const base: Tilemap = {
    rows: [...skyRows(5), run('g', COLS), run('g', COLS)],
    legend: { s: { tile: 'sky' }, l: { tile: 'skyLow' }, g: { tile: 'grass' } },
  };
  const far: Tilemap = {
    rows: [run('ab', COLS / 2)],
    legend: { a: { tile: 'hillsA', tint: 'ice' }, b: { tile: 'hillsB', tint: 'ice' } },
    x: -10,
    y: 62,
  };
  const hills: Tilemap = {
    rows: [run('ab', COLS / 2 + 1)],
    legend: { a: { tile: 'hillsA' }, b: { tile: 'hillsB' } },
    y: 70,
  };
  return [
    { map: base, layer: 'back' },
    { map: far, layer: 'back' },
    { map: hills, layer: 'back' },
  ];
}

function buildKiteHill(state: SceneState): SceneLayers {
  const frame = state.frame ?? 0;
  const back: Placement[] = [];
  const [base, far, hills] = kiteHillMaps();
  if (base !== undefined) back.push(...tilemapPlacements(base.map, { frame }));
  back.push(place({ prop: 'sun', x: 166, y: 4, layer: 'back' }, frame));
  // Clouds drift slowly across the wide sky.
  for (const [i, [x, y]] of (
    [
      [6, 6],
      [70, 2],
      [120, 18],
      [30, 34],
      [150, 44],
    ] as const
  ).entries()) {
    const drift = Math.floor(frame / 8 + i * 13) % 24;
    back.push(place({ prop: 'cloud', x: x + drift - 12, y, layer: 'back' }, frame));
  }
  if (far !== undefined) back.push(...tilemapPlacements(far.map, { frame }));
  if (hills !== undefined) back.push(...tilemapPlacements(hills.map, { frame }));
  back.push(place({ prop: 'pole', x: 2, y: 60, layer: 'back' }, frame));
  back.push(
    place({ prop: 'pennant', x: 6, y: 62, layer: 'back', tint: 'yellow', every: 3 }, frame),
  );
  return { width: SCENE_SIZE.width, height: SCENE_SIZE.height, back, front: [] };
}

// ---------------------------------------------------------------------------------------------
// The registry

const STANDS: Readonly<Record<GamesSceneId, StandsTheme>> = {
  sauna: {
    backdrop: INDOOR_BACKDROP,
    seat: 'pine',
    riser: 'red',
    crowd: TEAM_RAMPS,
    bunting: ['red', 'yellow', 'orange'],
  },
  'frost-bath': {
    backdrop: INDOOR_BACKDROP,
    seat: 'frost',
    riser: 'tide',
    crowd: TEAM_RAMPS,
    bunting: ['tide', 'teal', 'ghost'],
  },
  'pepper-table': {
    backdrop: INDOOR_BACKDROP,
    seat: 'wood',
    riser: 'green',
    crowd: TEAM_RAMPS,
    bunting: ['red', 'green', 'yellow'],
  },
  'melon-hill': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'wood',
    riser: 'green',
    crowd: TEAM_RAMPS,
    bunting: ['red', 'yellow', 'blue'],
  },
  'shark-lake': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'pine',
    riser: 'tide',
    crowd: TEAM_RAMPS,
    bunting: ['blue', 'yellow', 'red'],
  },
  'ice-floe': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'frost',
    riser: 'purple',
    crowd: TEAM_RAMPS,
    bunting: ['ghost', 'tide', 'purple'],
  },
  'log-trail': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'wood',
    riser: 'grove',
    crowd: TEAM_RAMPS,
    bunting: ['green', 'yellow', 'red'],
  },
  'pumpkin-hill': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'wood',
    riser: 'orange',
    crowd: TEAM_RAMPS,
    bunting: ['orange', 'yellow', 'purple'],
  },
  'barrel-pond': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'wood',
    riser: 'tide',
    crowd: TEAM_RAMPS,
    bunting: ['blue', 'yellow', 'teal'],
  },
  'crate-yard': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'pine',
    riser: 'mire',
    crowd: TEAM_RAMPS,
    bunting: ['orange', 'green', 'yellow'],
  },
  'kite-hill': {
    backdrop: OUTDOOR_BACKDROP,
    seat: 'wood',
    riser: 'spark',
    crowd: TEAM_RAMPS,
    bunting: ['yellow', 'pink', 'blue'],
  },
};

function scene(
  id: GamesSceneId,
  anchors: Record<string, ScenePoint[]>,
  tilemaps: { map: Tilemap; layer: SceneLayer }[],
  build: (state: SceneState) => SceneLayers,
): GamesSceneArt {
  const stands = STANDS[id];
  return {
    id,
    anchors,
    tilemaps: [...tilemaps, ...standsMaps(stands)],
    layers: (state = {}) => build(state),
    stands: (state = {}) => buildStands(stands, state),
  };
}

export const GAMES_SCENES: Readonly<Record<GamesSceneId, GamesSceneArt>> = {
  sauna: scene('sauna', saunaAnchors(), saunaMaps(SAUNA_THEME), (s) => buildSauna(SAUNA_THEME, s)),
  'frost-bath': scene('frost-bath', saunaAnchors(), saunaMaps(FROST_THEME), (s) =>
    buildSauna(FROST_THEME, s),
  ),
  'pepper-table': scene('pepper-table', pepperAnchors(), pepperMaps(), buildPepper),
  'melon-hill': scene('melon-hill', melonAnchors(), melonMaps(), buildMelon),
  'shark-lake': scene('shark-lake', lakeAnchors(), lakeMaps(), buildLake),
  'ice-floe': scene('ice-floe', floeAnchors(), floeMaps(), buildFloe),
  'log-trail': scene('log-trail', haulAnchors(), melonMaps(), (s) => buildHill(s, 'logs')),
  'pumpkin-hill': scene('pumpkin-hill', haulAnchors(), melonMaps(), (s) =>
    buildHill(s, 'pumpkins'),
  ),
  'barrel-pond': scene('barrel-pond', teamAnchors([BARREL_FEET_Y, 63, 94]), pondMaps(), buildPond),
  'crate-yard': scene('crate-yard', teamAnchors([YARD_BASE_Y, 104]), yardMaps(), buildYard),
  'kite-hill': scene('kite-hill', teamAnchors([98, 106]), kiteHillMaps(), buildKiteHill),
};

/** The top-left of a 16x16 creature sprite whose feet-centre is at a point. */
export function actorTopLeft(p: ScenePoint): ScenePoint {
  return { x: p.x - ACTOR_SIZE / 2, y: p.y - ACTOR_SIZE };
}
