/**
 * The dungeon map as pure data: where each room stands on the picture, which rooms and paths are lit,
 * and the words for a room (its accessible label, its drawer's title and lines). Nothing here touches
 * the DOM or the network (`DungeonMap.tsx` draws it, `DungeonNodeDrawer.tsx` is the sheet a tap opens).
 * Text is plain; names come from the server and are rendered as text only.
 *
 * The picture is a vertical map in a fixed coordinate space (`MAP_WIDTH` wide, like an SVG viewBox) that
 * the stylesheet scales to the width of the screen: the entrance row at the top, the floor boss at the
 * bottom (the player delves downward, and the Undercroft's floors come below it), three lanes across. At 320 px (the narrowest phone) one unit is one pixel, so every room
 * button of `MIN_NODE` units is at least 44 px there, and bigger on wider screens.
 */
import { undercroftOpen } from '@creatures/game';
import { elementName } from './game';
import type {
  DungeonMapNode,
  DungeonMapView,
  DungeonNodeKind,
  DungeonRunState,
  DungeonStepLog,
  Element,
} from './dungeon-types';

/**
 * What the map needs of a run: where it stands, what it has walked and where it may go. An open run
 * (`DungeonRunState`) is one; so is the route of a finished run, which the results screen draws with
 * `status: 'done'` and no room it stands in.
 */
export type MapRun = Pick<DungeonRunState, 'status' | 'at' | 'path' | 'reachable' | 'landmark'> & {
  /** What each room visited did (absent from an older server). */
  history?: readonly DungeonStepLog[] | undefined;
  /** The level the run stands in (0: the day's map, 1 and up: the Undercroft). Absent: 0. */
  level?: number | undefined;
};

/** The width of the map's coordinate space, in units (one pixel on the narrowest phone). */
export const MAP_WIDTH = 320;
/** The smallest room button, in units: a comfortable tap target at 320 px wide. */
export const MIN_NODE = 46;

/** How big each kind of room is drawn, in units. The camp and the boss stand out a little. */
const NODE_SIZE: Readonly<Record<DungeonNodeKind, number>> = {
  fight: MIN_NODE,
  elite: 50,
  mystery: MIN_NODE,
  cache: MIN_NODE,
  camp: 54,
  boss: 62,
  door: MIN_NODE,
  epic: 56,
};

/** The level of a room by its id: `u2f1l0` is on Undercroft level 2; every other id is on the day's map (0). */
export function nodeLevel(id: string): number {
  const found = /^u(\d+)f\d+l\d+$/.exec(id);
  return found === null ? 0 : Number(found[1]);
}

interface MapLayoutOptions {
  /** The width of the coordinate space (default `MAP_WIDTH`). */
  width?: number;
  /** The distance between two rows (default 74). */
  floorGap?: number;
  /** Space left above the entrance row and below the boss (default 44). */
  padding?: number;
}

/** A room placed on the picture. `x` and `y` are its centre; `size` its diameter. */
export interface LaidNode {
  id: string;
  /** 0 on the day's map, 1 and up on an Undercroft level. */
  level: number;
  floor: number;
  lane: number;
  kind: DungeonNodeKind;
  x: number;
  y: number;
  size: number;
}

/** A path between two rooms, from a row to the next one down, centre to centre. */
export interface LaidEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MapLayout {
  width: number;
  height: number;
  nodes: LaidNode[];
  edges: LaidEdge[];
}

/** Where a room goes when the map has a lane it does not know (the middle one). */
const MIDDLE = 1;

/**
 * Positions for every room of the map. Row 0 (the entrance) is at the top and the last row (the boss) at the bottom. A row
 * with one room (the camp, the boss) is centred; otherwise a room stands in its lane (left, middle or
 * right), so two rooms on a floor keep the lanes the server gave them and the paths never cross. A path to
 * a room the map does not have is left out. Always finite numbers, even for a map with no rooms.
 */
export function mapLayout(map: DungeonMapView, opts: MapLayoutOptions = {}): MapLayout {
  const width = opts.width ?? MAP_WIDTH;
  const gap = opts.floorGap ?? 74;
  const padding = opts.padding ?? 44;
  const floors = Math.max(1, map.floors, ...map.nodes.map((n) => n.floor + 1));
  const height = padding * 2 + (floors - 1) * gap;
  // The lanes sit inside a margin that keeps the biggest room (and its glow) on the screen.
  const margin = Math.round(width * 0.175);
  const laneX = (lane: number): number =>
    margin + (Math.min(2, Math.max(0, lane)) * (width - margin * 2)) / 2;
  const perFloor = new Map<number, number>();
  for (const node of map.nodes) perFloor.set(node.floor, (perFloor.get(node.floor) ?? 0) + 1);

  const nodes: LaidNode[] = map.nodes.map((node) => ({
    id: node.id,
    level: nodeLevel(node.id),
    floor: node.floor,
    lane: node.lane,
    kind: node.kind,
    x:
      perFloor.get(node.floor) === 1
        ? width / 2
        : laneX(Number.isFinite(node.lane) ? node.lane : MIDDLE),
    y: padding + node.floor * gap,
    size: NODE_SIZE[node.kind],
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LaidEdge[] = [];
  for (const node of map.nodes) {
    const a = byId.get(node.id);
    if (a === undefined) continue;
    for (const next of node.next) {
      const b = byId.get(next);
      if (b === undefined) continue;
      edges.push({ from: a.id, to: b.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return { width, height, nodes, edges };
}

/** The space between two stacked levels, in units: room for the label of the level below. */
export const LEVEL_SEAM = 16;

/** A darker band of the stacked picture: an Undercroft level, with its label. */
export interface LaidBand {
  kind: 'undercroft';
  /** The Undercroft level it holds. */
  level: number;
  y: number;
  height: number;
  /** Where the label stands (its centre), in units: in the seam at the band's top. */
  labelY: number;
  label: string;
  /** The level's keeper stands on a cracked floor. */
  crack: boolean;
}

export interface StackLayout extends MapLayout {
  bands: LaidBand[];
}

/** The label of an Undercroft floor: the server's own, or a plain one when it sent none. */
export function levelLabel(map: Pick<DungeonMapView, 'level' | 'label'>): string {
  return map.label ?? `Undercroft floor ${String(map.level ?? 1)}`;
}

/**
 * The day's map with the Undercroft levels drawn so far stacked below its floor boss (the map grows
 * downward): each level is laid out like the day's map (its own entrance row at the top, its floor boss
 * at the bottom), the first level right under the day's map, with a seam above each level that holds
 * its label. Without a level it is the day's map exactly as `mapLayout` draws it. A level's `level` number does not matter: the order of the
 * list is the order of the stack.
 */
export function stackLayout(
  main: DungeonMapView,
  undercroft: readonly DungeonMapView[],
  opts: MapLayoutOptions = {},
): StackLayout {
  const parts = [main, ...undercroft].map((m) => mapLayout(m, opts));
  const width = parts[0]?.width ?? opts.width ?? MAP_WIDTH;
  if (undercroft.length === 0) return { ...(parts[0] as MapLayout), bands: [] };
  const height = parts.reduce((sum, p) => sum + p.height, 0) + LEVEL_SEAM * undercroft.length;
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  const bands: LaidBand[] = [];
  let y = 0;
  // From the top: the day's map first, then each Undercroft level in order.
  parts.forEach((part, i) => {
    const map = i === 0 ? main : (undercroft[i - 1] as DungeonMapView);
    if (i > 0) {
      bands.push({
        kind: 'undercroft',
        level: map.level ?? i,
        y,
        height: part.height + LEVEL_SEAM,
        labelY: y + LEVEL_SEAM / 2,
        label: levelLabel(map),
        crack: map.crack === true,
      });
      y += LEVEL_SEAM;
    }
    for (const n of part.nodes) nodes.push({ ...n, y: n.y + y });
    for (const e of part.edges) edges.push({ ...e, y1: e.y1 + y, y2: e.y2 + y });
    y += part.height;
  });
  // The day's map first in the list (the order of the rooms is the order of the picture, top down).
  nodes.sort((a, b) => a.level - b.level);
  return { width, height, nodes, edges, bands };
}

// --- Where a run starts ---

/** A start marker: a small triangle above an entrance room, pointing down into it. Units of the map's space. */
export interface StartMarker {
  /** The entrance room it points into. */
  id: string;
  /** The three corners as an SVG `points` string: the apex touches the room's top, the base is above. */
  points: string;
}

/** The gap between a room and the apex of its marker, the marker's height and its width, in units. */
const START_GAP = 4;
const START_HEIGHT = 10;
const START_WIDTH = 16;

/**
 * The level whose entrance rooms get a start marker: the day's map (0) before the player has entered,
 * and the level a run stands before (it has not made its first move there yet). Null once the run has
 * moved, when it is over (a finished route), or for a map shown with no run to start.
 */
export function startLevel(state: MapRun | null): number | null {
  if (state === null) return 0;
  return state.status === 'active' && state.at === null ? (state.level ?? 0) : null;
}

/** The start markers of a layout: one above every row-0 room of `level`, pointing down into it. */
export function startMarkers(layout: Pick<MapLayout, 'nodes'>, level: number): StartMarker[] {
  return layout.nodes
    .filter((n) => n.level === level && n.floor === 0)
    .map((n) => {
      const apex = n.y - n.size / 2 - START_GAP;
      const base = apex - START_HEIGHT;
      const half = START_WIDTH / 2;
      return {
        id: n.id,
        points: `${String(round(n.x))},${String(round(apex))} ${String(round(n.x - half))},${String(round(base))} ${String(round(n.x + half))},${String(round(base))}`,
      };
    });
}

// --- Where the way down is ---

/**
 * The rooms that carry the descent badge: the floor boss when the player's depth opens the Undercroft
 * (`undercroftOpen`; no depth given: none), and every Undercroft keeper whose floor is cracked (beating it
 * offers another way down), while the way down has not been taken (no level below it is drawn yet).
 * `levels[0]` is the day's map.
 */
export function descentRooms(
  levels: readonly Pick<DungeonMapView, 'nodes' | 'crack'>[],
  depth: number | undefined,
): Set<string> {
  const ids = new Set<string>();
  levels.forEach((map, i) => {
    for (const node of map.nodes) {
      if (node.kind !== 'boss') continue;
      // Once the next level is drawn the run has already gone down this way.
      if (i + 1 < levels.length) continue;
      if (i === 0 ? depth !== undefined && undercroftOpen(depth) : map.crack === true) {
        ids.add(node.id);
      }
    }
  });
  return ids;
}

/** True when the run was defeated in this room (its fight there was lost). */
export function lostAt(history: MapRun['history'], id: string): boolean {
  return (history ?? []).some((e) => e.node === id && e.result === 'fight' && !e.cleared);
}

/** The SVG path of an edge: a gentle S that leaves a room straight down and arrives straight down. */
export function edgePath(edge: LaidEdge): string {
  const mid = (edge.y1 + edge.y2) / 2;
  return `M ${round(edge.x1)} ${round(edge.y1)} C ${round(edge.x1)} ${round(mid)}, ${round(edge.x2)} ${round(mid)}, ${round(edge.x2)} ${round(edge.y2)}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- What is lit ---

/**
 * How a room looks. `visited`: the run has been there. `current`: the run stands there. `reachable`: the
 * run may go there now. `locked`: it is not next (or the run is over), but the run may still get there
 * later. `unreachable`: no path from where the run stands leads there any more. `preview`: there is no
 * run (the map before the player enters).
 */
export type NodeStatus = 'visited' | 'current' | 'reachable' | 'locked' | 'unreachable' | 'preview';

/**
 * Every room the run can still get to by following the paths forward from where it stands, near or far
 * (not the room it stands in). Before the entrance (`at` null) that is the whole map. A room that is
 * not in it, and not visited, is out of reach for good. A room the map does not have, or one with no
 * way on, gives an empty set.
 */
export function reachableAhead(map: Pick<DungeonMapView, 'nodes'>, at: string | null): Set<string> {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const ahead = new Set<string>();
  const queue: string[] =
    at === null
      ? map.nodes.filter((n) => n.floor === 0).map((n) => n.id)
      : [...(byId.get(at)?.next ?? [])];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (ahead.has(id) || id === at) continue;
    ahead.add(id);
    for (const next of byId.get(id)?.next ?? []) queue.push(next);
  }
  return ahead;
}

/**
 * `reachableAhead` for a run on stacked maps (`levels[0]` is the day's map, then the Undercroft levels in
 * order): by the map the run stands in, or, before the entrance of a level (`at` null), the map of the level
 * it is on. A room of another level is never in it, so the levels the run has left are out of reach.
 */
export function reachableAheadAcross(
  levels: readonly Pick<DungeonMapView, 'nodes'>[],
  at: string | null,
  level: number,
): Set<string> {
  const own = at === null ? levels[level] : levels.find((m) => m.nodes.some((n) => n.id === at));
  return own === undefined ? new Set() : reachableAhead(own, at);
}

/**
 * True when an open run can no longer get to this room: it is not visited, not the room the run stands
 * in and not in `ahead` (`reachableAhead`). A run that is over, or no run, has none out of reach.
 */
function outOfReach(id: string, state: MapRun | null, ahead: ReadonlySet<string> | null): boolean {
  if (state === null || ahead === null || state.status !== 'active') return false;
  return state.at !== id && !state.path.includes(id) && !ahead.has(id);
}

/**
 * `ahead` (from `reachableAhead`) lets an open run tell a room it may still reach later (`locked`) from
 * one it never can (`unreachable`). Without it every room off the next step is `locked`.
 */
export function nodeStatus(
  node: Pick<DungeonMapNode, 'id'>,
  state: MapRun | null,
  ahead: ReadonlySet<string> | null = null,
): NodeStatus {
  if (state === null) return 'preview';
  if (state.at === node.id) return 'current';
  if (state.path.includes(node.id)) return 'visited';
  if (state.reachable.includes(node.id)) return 'reachable';
  return outOfReach(node.id, state, ahead) ? 'unreachable' : 'locked';
}

/**
 * How a path looks. `taken`: the run walked it (gold). `reachable`: it leads from where the run stands to a
 * room it may go to (bright). `preview`: there is no run. `unreachable`: it starts or ends in a room the
 * run can no longer get to. `dim`: any other.
 */
export type EdgeStatus = 'taken' | 'reachable' | 'preview' | 'dim' | 'unreachable';

/** The rooms of the run in order, ending in the room it stands in even when `path` does not list it. */
function walked(state: MapRun): string[] {
  const { path, at } = state;
  return at !== null && path[path.length - 1] !== at ? [...path, at] : path;
}

export function edgeStatus(
  edge: Pick<LaidEdge, 'from' | 'to'>,
  state: MapRun | null,
  ahead: ReadonlySet<string> | null = null,
): EdgeStatus {
  if (state === null) return 'preview';
  const path = walked(state);
  for (let i = 0; i + 1 < path.length; i++) {
    if (path[i] === edge.from && path[i + 1] === edge.to) return 'taken';
  }
  if (state.at === edge.from && state.reachable.includes(edge.to)) return 'reachable';
  if (outOfReach(edge.from, state, ahead) || outOfReach(edge.to, state, ahead))
    return 'unreachable';
  return 'dim';
}

/** The drawing order of paths: dim ones first, gold ones last, so a lit path is never covered. */
export const EDGE_ORDER: readonly EdgeStatus[] = [
  'preview',
  'unreachable',
  'dim',
  'reachable',
  'taken',
];

// --- Words ---

/** A foe's name as the map shows it: an elite is "Fierce <name>" (once, even if the server already said so). */
export function foeDisplayName(node: Pick<DungeonMapNode, 'foe'>): string {
  const foe = node.foe;
  if (foe === undefined) return '';
  return foe.elite && !foe.name.startsWith('Fierce ') ? `Fierce ${foe.name}` : foe.name;
}

/** The element that tints a room (fights, elites and the floor boss), or null. */
export function nodeElement(node: Pick<DungeonMapNode, 'kind' | 'foe'>): Element | null {
  return node.kind === 'fight' ||
    node.kind === 'elite' ||
    node.kind === 'boss' ||
    node.kind === 'epic'
    ? (node.foe?.element ?? null)
    : null;
}

/** The glyph id of a kind of room (`glyphs.ts`). */
export function nodeGlyph(kind: DungeonNodeKind): string {
  return `map-${kind}`;
}

/** True for the keeper of an Undercroft level: a floor boss on an Undercroft map. */
export function isKeeper(node: Pick<DungeonMapNode, 'id' | 'kind'>): boolean {
  return node.kind === 'boss' && nodeLevel(node.id) > 0;
}

/** The glyph of a room: the keeper has a crown of its own (darker), every other room the one of its kind. */
export function nodeGlyphOf(node: Pick<DungeonMapNode, 'id' | 'kind'>): string {
  return isKeeper(node) ? 'map-keeper' : nodeGlyph(node.kind);
}

/**
 * A short label for a room: "Fight: Puddle Imp, Tide", "Fierce Moss Lurker (elite)", "Mystery room",
 * "Cache", "Camp", "Floor boss: Coil Baron". It names what the room is, not whether the run can go there
 * (`nodeAriaLabel` adds that).
 */
export function nodeLabel(node: DungeonMapNode): string {
  const name = foeDisplayName(node);
  switch (node.kind) {
    case 'fight':
      return name === ''
        ? 'Fight'
        : `Fight: ${name}${node.foe === undefined ? '' : `, ${elementName(node.foe.element)}`}`;
    case 'elite':
      return name === '' ? 'Elite fight' : `${name} (elite)`;
    case 'mystery':
      return 'Mystery room';
    case 'cache':
      return 'Cache';
    case 'camp':
      return 'Camp';
    case 'boss':
      if (isKeeper(node))
        return name === '' ? 'Undercroft floor boss' : `Undercroft floor boss: ${name}`;
      return name === '' ? 'Floor boss' : `Floor boss: ${name}`;
    case 'door':
      return 'Carved door';
    case 'epic':
      return name === '' ? 'Epic fight' : `${name} (epic fight)`;
  }
}

/** What a screen reader hears when it reaches the room: its label and where the run is with it. */
const STATUS_WORDS: Readonly<Record<NodeStatus, string>> = {
  visited: 'Visited',
  current: 'You are here',
  reachable: 'You can go here',
  locked: 'Not on your path',
  unreachable: 'Out of reach',
  preview: '',
};

/** The words for a floor boss on a cracked floor. */
export const CRACKED_WORD = 'Cracked floor';

/** The words for the room where the run was lost. */
export const LOST_WORD = 'You were defeated here';
/** The words for a room whose fall opens the way down. */
export const DESCENT_WORD = 'The way down';

interface AriaExtras {
  /** The Undercroft floor boss stands on a cracked floor. */
  crack?: boolean;
  /** The room's fall opens the way down into the Undercroft. */
  descent?: boolean;
  /** The run was defeated here (said in place of "Visited"). */
  lost?: boolean;
}

export function nodeAriaLabel(
  node: DungeonMapNode,
  status: NodeStatus,
  extras: AriaExtras = {},
): string {
  const word = extras.lost === true ? LOST_WORD : STATUS_WORDS[status];
  const parts = [
    nodeLabel(node),
    ...(extras.crack === true ? [CRACKED_WORD] : []),
    ...(extras.descent === true && extras.crack !== true ? [DESCENT_WORD] : []),
    ...(word === '' ? [] : [word]),
  ];
  return `${parts.join('. ')}. Show details`;
}

/** The title of a room's drawer. The foe's own name is in the body. */
export function nodeTitle(node: Pick<DungeonMapNode, 'id' | 'kind'>): string {
  switch (node.kind) {
    case 'fight':
      return 'Fight';
    case 'elite':
      return 'Elite fight';
    case 'mystery':
      return 'Mystery room';
    case 'cache':
      return 'Cache';
    case 'camp':
      return 'Camp';
    case 'boss':
      return isKeeper(node) ? 'Undercroft floor boss' : 'Floor boss';
    case 'door':
      return 'Carved door';
    case 'epic':
      return 'Epic fight';
  }
}

export const MYSTERY_LINE = "Something stirs. You'll see when you step in.";
export const CACHE_LINE = 'Free loot: Bait and scrap for your pack.';
export const CAMP_LINE =
  'Rest, swap a creature or take a keepsake, then push on or head home with your pack.';
/** A carved door: what stepping through could add (the six kinds), never which. */
export const DOOR_LINE =
  'A carved door. Step through to add one room to the first Undercroft floor: a fight, a fierce foe, a mystery, a cache, a camp or an epic fight. You find out which when you descend.';
/** A floor boss on a cracked floor. */
export const CRACK_LINE = 'A cracked floor: beat the floor boss to go down another floor.';
/** The day's floor boss, when beating it will let the player descend. */
export const DESCEND_LINE = 'Beat it to descend into the Undercroft.';
/** The line of every room of the Undercroft that says it is harder. */
export const FIERCER_LINE = 'The Undercroft · foes are fiercer here.';
/** A room that looked like a mystery and held nothing (a carved door below depth 8). */
export const QUIET_LINE = 'Nothing stirred here. It was a quiet room.';
export const NO_TRICK_LINE = 'No tricks. It just attacks.';
export const LOCKED_LINE = 'Not on your path.';
export const UNREACHABLE_LINE = "You can't reach this room any more.";
/** A room a finished run did not go to (the results map). */
export const NOT_VISITED_LINE = 'Your run did not go here.';

/**
 * The lines of a drawer body that are plain words: what a mystery room, a cache and the camp are. Fights,
 * elites and the boss have none (their body is the foe: picture, name, element, trick, twist and HP).
 */
export function nodeLines(node: Pick<DungeonMapNode, 'kind'>): string[] {
  switch (node.kind) {
    case 'mystery':
      return [MYSTERY_LINE];
    case 'cache':
      return [CACHE_LINE];
    case 'camp':
      return [CAMP_LINE];
    case 'door':
      return [DOOR_LINE];
    default:
      return [];
  }
}

/** "HP 412". */
export function hpLine(hpMax: number): string {
  return `HP ${String(Math.max(0, Math.round(hpMax)))}`;
}

/** True when the run may go to this room right now, and the caller can act on it. */
export function canGo(node: Pick<DungeonMapNode, 'id'>, state: MapRun | null): boolean {
  return state !== null && state.status === 'active' && state.reachable.includes(node.id);
}

/** The glossary entry a kind of room explains itself with, or null when it has none. */
export function nodeGlossaryEntry(kind: DungeonNodeKind): string | null {
  switch (kind) {
    case 'elite':
      return 'elite';
    case 'mystery':
      return 'mystery-room';
    case 'cache':
      return 'cache';
    case 'camp':
      return 'dungeon-camp';
    case 'door':
      return 'carved-door';
    case 'epic':
      return 'epic-fight';
    default:
      return null;
  }
}
