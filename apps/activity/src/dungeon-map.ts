/**
 * The dungeon map as pure data: where each room stands on the picture, which rooms and paths are lit,
 * and the words for a room (its accessible label, its drawer's title and lines). Nothing here touches
 * the DOM or the network (`DungeonMap.tsx` draws it, `DungeonNodeDrawer.tsx` is the sheet a tap opens).
 * Text is plain; names come from the server and are rendered as text only.
 *
 * The picture is a vertical map in a fixed coordinate space (`MAP_WIDTH` wide, like an SVG viewBox) that
 * the stylesheet scales to the width of the screen: the room boss at the top, the entrance floor at the
 * bottom, three lanes across. At 320 px (the narrowest phone) one unit is one pixel, so every room
 * button of `MIN_NODE` units is at least 44 px there, and bigger on wider screens.
 */
import { elementName } from './game';
import type {
  DungeonMapNode,
  DungeonMapView,
  DungeonNodeKind,
  DungeonRunState,
  Element,
} from './dungeon-types';

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
};

interface MapLayoutOptions {
  /** The width of the coordinate space (default `MAP_WIDTH`). */
  width?: number;
  /** The distance between two floors (default 74). */
  floorGap?: number;
  /** Space left above the boss and below the entrance floor (default 44). */
  padding?: number;
}

/** A room placed on the picture. `x` and `y` are its centre; `size` its diameter. */
export interface LaidNode {
  id: string;
  floor: number;
  lane: number;
  kind: DungeonNodeKind;
  x: number;
  y: number;
  size: number;
}

/** A path between two rooms, from the lower floor to the one above it, centre to centre. */
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
 * Positions for every room of the map. Floor 0 is at the bottom and the last floor at the top. A floor
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
    floor: node.floor,
    lane: node.lane,
    kind: node.kind,
    x:
      perFloor.get(node.floor) === 1
        ? width / 2
        : laneX(Number.isFinite(node.lane) ? node.lane : MIDDLE),
    y: padding + (floors - 1 - node.floor) * gap,
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

/** The SVG path of an edge: a gentle S that leaves a room straight up and arrives straight up. */
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
 * run may go there now. `locked`: it is out of reach (or the run is over). `preview`: there is no run
 * (the map before the player enters).
 */
export type NodeStatus = 'visited' | 'current' | 'reachable' | 'locked' | 'preview';

export function nodeStatus(
  node: Pick<DungeonMapNode, 'id'>,
  state: DungeonRunState | null,
): NodeStatus {
  if (state === null) return 'preview';
  if (state.at === node.id) return 'current';
  if (state.path.includes(node.id)) return 'visited';
  if (state.reachable.includes(node.id)) return 'reachable';
  return 'locked';
}

/**
 * How a path looks. `taken`: the run walked it (gold). `reachable`: it leads from where the run stands to a
 * room it may go to (bright). `preview`: there is no run. `dim`: any other.
 */
export type EdgeStatus = 'taken' | 'reachable' | 'preview' | 'dim';

/** The rooms of the run in order, ending in the room it stands in even when `path` does not list it. */
function walked(state: DungeonRunState): string[] {
  const { path, at } = state;
  return at !== null && path[path.length - 1] !== at ? [...path, at] : path;
}

export function edgeStatus(
  edge: Pick<LaidEdge, 'from' | 'to'>,
  state: DungeonRunState | null,
): EdgeStatus {
  if (state === null) return 'preview';
  const path = walked(state);
  for (let i = 0; i + 1 < path.length; i++) {
    if (path[i] === edge.from && path[i + 1] === edge.to) return 'taken';
  }
  if (state.at === edge.from && state.reachable.includes(edge.to)) return 'reachable';
  return 'dim';
}

/** The drawing order of paths: dim ones first, gold ones last, so a lit path is never covered. */
export const EDGE_ORDER: readonly EdgeStatus[] = ['preview', 'dim', 'reachable', 'taken'];

// --- Words ---

/** A foe's name as the map shows it: an elite is "Fierce <name>" (once, even if the server already said so). */
export function foeDisplayName(node: Pick<DungeonMapNode, 'foe'>): string {
  const foe = node.foe;
  if (foe === undefined) return '';
  return foe.elite && !foe.name.startsWith('Fierce ') ? `Fierce ${foe.name}` : foe.name;
}

/** The element that tints a room (fights, elites and the room boss), or null. */
export function nodeElement(node: Pick<DungeonMapNode, 'kind' | 'foe'>): Element | null {
  return node.kind === 'fight' || node.kind === 'elite' || node.kind === 'boss'
    ? (node.foe?.element ?? null)
    : null;
}

/** The glyph id of a kind of room (`glyphs.ts`). */
export function nodeGlyph(kind: DungeonNodeKind): string {
  return `map-${kind}`;
}

/**
 * A short label for a room: "Fight: Puddle Imp, Tide", "Fierce Moss Lurker (elite)", "Mystery room",
 * "Cache", "Camp", "Room boss: Coil Baron". It names what the room is, not whether the run can go there
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
      return name === '' ? 'Room boss' : `Room boss: ${name}`;
  }
}

/** What a screen reader hears when it reaches the room: its label and where the run is with it. */
const STATUS_WORDS: Readonly<Record<NodeStatus, string>> = {
  visited: 'Visited',
  current: 'You are here',
  reachable: 'You can go here',
  locked: 'Not on your path',
  preview: '',
};

export function nodeAriaLabel(node: DungeonMapNode, status: NodeStatus): string {
  const word = STATUS_WORDS[status];
  return word === ''
    ? `${nodeLabel(node)}. Show details`
    : `${nodeLabel(node)}. ${word}. Show details`;
}

/** The title of a room's drawer. The foe's own name is in the body. */
export function nodeTitle(node: Pick<DungeonMapNode, 'kind'>): string {
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
      return 'Room boss';
  }
}

export const MYSTERY_LINE = "Something stirs. You'll see when you step in.";
export const CACHE_LINE = 'Free loot: Bait and scrap for your pack.';
export const CAMP_LINE =
  'Rest, swap a creature or take a keepsake, then push on or head home with your pack.';
export const NO_TRICK_LINE = 'No tricks. It just attacks.';
export const LOCKED_LINE = 'Not on your path.';

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
    default:
      return [];
  }
}

/** "HP 412". */
export function hpLine(hpMax: number): string {
  return `HP ${String(Math.max(0, Math.round(hpMax)))}`;
}

/** True when the run may go to this room right now, and the caller can act on it. */
export function canGo(node: Pick<DungeonMapNode, 'id'>, state: DungeonRunState | null): boolean {
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
    default:
      return null;
  }
}
