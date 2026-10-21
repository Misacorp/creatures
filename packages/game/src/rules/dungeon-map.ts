/**
 * The daily dungeon's map (docs/design/dungeon-paths.md): seven floors from an entrance to a floor boss,
 * two or three rooms on most floors, a camp in the middle where every path meets. Pure data and pure
 * functions: the map is drawn from an injected `Rng` (the server passes a seeded stream of the day's
 * seed, so everyone on a server sees the same map), and `dungeonMapValid` checks every rule so a
 * stored map that does not hold up is refused instead of played.
 *
 * A node id is `f<floor>l<lane>` (`f2l1`). Floors 0 to 6, lanes 0 to 2. Floor `campFloor` is the camp,
 * a single node in lane 1; the last floor is the floor boss, a single node in lane 1.
 */
import * as v from 'valibot';
import { dungeonContent, dungeonEvents } from '../content/dungeon';
import type { DungeonEventDef, DungeonFoeDef, RoomModifierDef } from '../content/dungeon-schema';
import { IdSchema } from '../content/schema';
import { chance, int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';

export const NODE_KINDS = [
  'fight',
  'elite',
  'mystery',
  'cache',
  'camp',
  'boss',
  'door',
  'epic',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** The lane the camp and the floor boss stand in. */
const MIDDLE_LANE = 1;
const LANES = 3;

export interface MapNode {
  id: string;
  floor: number;
  lane: number;
  kind: NodeKind;
  /** The nodes on the next floor this one leads to. */
  next: string[];
  /** The normal foe of a fight or an elite, or the floor boss of the boss node. */
  foeId?: string;
  /** The room modifier of a fight, an elite or the boss. */
  modifierId?: string;
  /** The event of a mystery room. */
  eventId?: string;
}

export interface DungeonMap {
  floors: number;
  nodes: MapNode[];
  /**
   * An Undercroft map only: its level (1 to `RULES.dungeon.undercroft.maxLevels`). Absent on the day's
   * main map. Its node ids are `u<level>f<floor>l<lane>`, so they never clash with the main map's.
   */
  level?: number;
  /** An Undercroft map only: the keeper's room has a cracked floor, which opens a deeper level when the keeper falls. */
  crack?: boolean;
}

/** What a map is drawn from: the foes, the room modifiers and the events (the shipped content by default). */
export interface MapContent {
  foes: readonly DungeonFoeDef[];
  modifiers: readonly RoomModifierDef[];
  events: readonly DungeonEventDef[];
}

const shipped = (): MapContent => ({
  foes: dungeonContent.foes,
  modifiers: dungeonContent.modifiers,
  events: dungeonEvents,
});

/** The shape of a stored map: strict, with the lengths the rules allow. Rules beyond shape are `dungeonMapValid`'s. */
const NODE_ID = /^(?:u\d+)?f\d+l\d+$/;
const MapNodeSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(NODE_ID)),
  floor: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)),
  lane: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(LANES - 1)),
  kind: v.picklist(NODE_KINDS),
  next: v.pipe(v.array(v.pipe(v.string(), v.regex(NODE_ID))), v.maxLength(LANES)),
  foeId: v.optional(IdSchema),
  modifierId: v.optional(IdSchema),
  eventId: v.optional(IdSchema),
});
export const DungeonMapSchema = v.strictObject({
  floors: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  nodes: v.pipe(v.array(MapNodeSchema), v.maxLength(40)),
  level: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9))),
  crack: v.optional(v.boolean()),
});

export const nodeId = (floor: number, lane: number): string => `f${String(floor)}l${String(lane)}`;

/** A node by id, or undefined. */
export function mapNode(map: DungeonMap, id: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

/**
 * The nodes a run standing at `at` may move to: the floor-0 nodes before the run has started (`at`
 * null), otherwise the node's exits. Empty at the boss or for an id that is not on the map.
 */
export function reachableNodes(map: DungeonMap, at: string | null): string[] {
  if (at === null) return map.nodes.filter((n) => n.floor === 0).map((n) => n.id);
  return [...(mapNode(map, at)?.next ?? [])];
}

// --- Drawing the map ---

type Edge = readonly [from: number, to: number];

/** Two edges cross when the one starting further left ends further right. */
function crosses(a: Edge, b: Edge): boolean {
  return (a[0] < b[0] && a[1] > b[1]) || (a[0] > b[0] && a[1] < b[1]);
}

/**
 * Every set of edges between two floors (lanes in `from` and `to`) that follows the rules: lanes differ
 * by at most 1, nothing crosses, every node above has 1 or 2 exits and every node below has a way in.
 * The floors are at most three nodes wide, so this is a few hundred subsets at most.
 */
function linkChoices(from: readonly number[], to: readonly number[]): Edge[][] {
  const allowed: Edge[] = [];
  for (const a of from) for (const b of to) if (Math.abs(a - b) <= 1) allowed.push([a, b]);
  const out: Edge[][] = [];
  for (let mask = 1; mask < 1 << allowed.length; mask++) {
    const edges = allowed.filter((_, i) => (mask & (1 << i)) !== 0);
    const exitsOk = from.every((a) => {
      const n = edges.filter((e) => e[0] === a).length;
      return n >= 1 && n <= 2;
    });
    const entriesOk = to.every((b) => edges.some((e) => e[1] === b));
    const noCrossing = edges.every((x) => edges.every((y) => !crosses(x, y)));
    if (exitsOk && entriesOk && noCrossing) out.push(edges);
  }
  return out;
}

/** The lanes of a floor with 2 or 3 nodes: 2 nodes (chance `twoNodeFloorBp`) leave out lane 0 or lane 2, never the middle. */
function drawLanes(rng: Rng): number[] {
  if (!chance(rng, RULES.dungeon.map.twoNodeFloorBp, 10_000)) return [0, 1, 2];
  return int(rng, 2) === 0 ? [1, 2] : [0, 1];
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The floors with a choice of rooms: every floor but the camp and the boss. */
function playFloors(): number[] {
  const floors: number[] = [];
  for (let f = 0; f < RULES.dungeon.floors - 1; f++)
    if (f !== RULES.dungeon.campFloor) floors.push(f);
  return floors;
}

/** The nodes of a floor sharing a parent with `node` (not the node itself), for the sibling rule. */
function siblingsOf(nodes: readonly MapNode[], node: MapNode): MapNode[] {
  const parents = nodes.filter((p) => p.next.includes(node.id));
  return nodes.filter(
    (n) => n.floor === node.floor && n.id !== node.id && parents.some((p) => p.next.includes(n.id)),
  );
}

/** One try at a map: the shape, then the kinds, then what fills each room. Null when a rule could not be met (draw again). */
function drawMap(rng: Rng, pack: MapContent, doors: boolean): DungeonMap | null {
  const rules = RULES.dungeon;
  const last = rules.floors - 1;
  const lanesOf = new Map<number, number[]>();
  for (const f of playFloors()) lanesOf.set(f, drawLanes(rng));
  lanesOf.set(rules.campFloor, [MIDDLE_LANE]);
  lanesOf.set(last, [MIDDLE_LANE]);

  const nodes: MapNode[] = [];
  for (let f = 0; f <= last; f++) {
    for (const lane of lanesOf.get(f) ?? []) {
      nodes.push({ id: nodeId(f, lane), floor: f, lane, kind: 'fight', next: [] });
    }
  }
  const at = (id: string): MapNode => nodes.find((n) => n.id === id) as MapNode;

  // Edges. The floors beside the camp and the boss have one way through; the rest are drawn.
  for (let f = 0; f < last; f++) {
    const from = lanesOf.get(f) ?? [];
    const to = lanesOf.get(f + 1) ?? [];
    if (f + 1 === rules.campFloor || f === rules.campFloor || f + 1 === last) {
      for (const a of from) at(nodeId(f, a)).next = to.map((b) => nodeId(f + 1, b));
      continue;
    }
    const choices = linkChoices(from, to);
    const chosen = choices[int(rng, choices.length)] as Edge[];
    for (const [a, b] of chosen) at(nodeId(f, a)).next.push(nodeId(f + 1, b));
  }

  // Kinds. Floor 0 stays all fights; every other room rolls, never past a cap or beside its sibling.
  const m = rules.map;
  const eliteFloors: readonly number[] = m.eliteFloors;
  const counts = { elite: 0, cache: 0, mystery: 0 };
  const rolled = nodes.filter(
    (n) => n.floor > 0 && n.floor !== rules.campFloor && n.floor !== last,
  );
  for (const node of rolled) {
    const siblings = siblingsOf(nodes, node);
    const onFloor = nodes.filter((n) => n.floor === node.floor);
    const eliteOk =
      eliteFloors.includes(node.floor) &&
      counts.elite < m.maxElites &&
      !onFloor.some((n) => n.kind === 'elite');
    const cacheOk = counts.cache < m.maxCaches && !siblings.some((n) => n.kind === 'cache');
    const mysteryOk =
      counts.mystery < m.maxMysteries && !siblings.some((n) => n.kind === 'mystery');
    const kind = pickWeighted<{ kind: NodeKind; weight: number }>(rng, [
      { kind: 'fight', weight: m.kinds.fight },
      { kind: 'mystery', weight: mysteryOk ? m.kinds.mystery : 0 },
      { kind: 'cache', weight: cacheOk ? m.kinds.cache : 0 },
      { kind: 'elite', weight: eliteOk ? m.kinds.elite : 0 },
    ]).kind;
    node.kind = kind;
    if (kind === 'elite' || kind === 'cache' || kind === 'mystery') counts[kind] += 1;
  }
  // The floors a repair may change: an elite goes on an early elite floor (never right before the boss).
  const fights = (floors: readonly number[]): MapNode[] =>
    rolled.filter((n) => n.kind === 'fight' && floors.includes(n.floor));
  if (counts.elite < m.minElites) {
    const options = fights(eliteFloors.filter((f) => f < last - 1));
    const pick = options[int(rng, options.length || 1)];
    if (pick === undefined) return null;
    pick.kind = 'elite';
    counts.elite += 1;
  }
  if (counts.mystery < m.minMysteries) {
    const options = fights(rolled.map((n) => n.floor));
    const pick = options[int(rng, options.length || 1)];
    if (pick === undefined) return null;
    pick.kind = 'mystery';
    counts.mystery += 1;
  }
  at(nodeId(rules.campFloor, MIDDLE_LANE)).kind = 'camp';
  at(nodeId(last, MIDDLE_LANE)).kind = 'boss';

  // What fills the rooms: a different normal foe for each fight on a floor, a modifier each, and the boss.
  const normal = pack.foes.filter((f) => f.kind === 'foe');
  const bosses = pack.foes.filter((f) => f.kind === 'boss');
  const modifier = (): string =>
    (pack.modifiers[int(rng, pack.modifiers.length)] as RoomModifierDef).id;
  for (let f = 0; f < last; f++) {
    const rooms = nodes.filter((n) => n.floor === f && (n.kind === 'fight' || n.kind === 'elite'));
    const foes = shuffled(rng, normal);
    for (const [i, node] of rooms.entries()) {
      const foe = foes[i];
      if (foe === undefined) return null;
      node.foeId = foe.id;
      node.modifierId = modifier();
    }
  }
  const boss = bosses[int(rng, bosses.length || 1)];
  if (boss === undefined) return null;
  const bossNode = at(nodeId(last, MIDDLE_LANE));
  bossNode.foeId = boss.id;
  bossNode.modifierId = modifier();
  // A rare event is never drawn onto a map: a run meets it live as it steps into a mystery room.
  const events = shuffled(
    rng,
    pack.events.filter((e) => e.rare === undefined),
  );
  for (const [i, node] of nodes.filter((n) => n.kind === 'mystery').entries()) {
    const event = events[i];
    if (event === undefined) return null;
    node.eventId = event.id;
  }
  // The carved door (only when asked for), drawn last so a map without one is exactly the map it was before doors: a fight
  // on one of the door floors becomes the door (it holds no foe, no modifier, no event).
  const door = rules.undercroft;
  if (doors && chance(rng, door.doorBp, 10_000)) {
    const doorFloors: readonly number[] = door.doorFloors;
    const options = nodes.filter((n) => n.kind === 'fight' && doorFloors.includes(n.floor));
    const pick = options[int(rng, options.length || 1)];
    if (pick !== undefined) {
      pick.kind = 'door';
      delete pick.foeId;
      delete pick.modifierId;
    }
  }
  return { floors: rules.floors, nodes };
}

/** How many times `generateDungeonMap` redraws before it gives up (the odds of needing even a second try are small). */
const MAX_DRAWS = 200;

/**
 * What else a day's map may have. `doors`: it may hold a carved door (`RULES.dungeon.undercroft.doorBp`).
 * Off by default, so a caller that does not play the Undercroft (the balance simulator, until it does)
 * draws exactly the maps it always drew; the server turns it on.
 */
export interface MapOptions {
  doors?: boolean;
}

/**
 * Draws a day's map from `rng`: the same stream (and options) always give the same map. The shape, the kinds and
 * the contents all follow the rules of `dungeonMapValid`, and a draw that cannot be made to follow
 * them (for example, fewer than three elements among the fights) is thrown away and drawn again.
 * Throws if the content cannot fill a map (too few foes or events).
 */
export function generateDungeonMap(
  rng: Rng,
  pack: MapContent = shipped(),
  options: MapOptions = {},
): DungeonMap {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const map = drawMap(rng, pack, options.doors === true);
    if (map !== null && dungeonMapValid(map, pack)) return map;
  }
  throw new Error('could not draw a valid dungeon map from the content');
}

// --- Checking a map ---

/**
 * True when `map` follows every rule of the design: its shape (floors, lanes, the camp and the boss),
 * its paths (lane steps, no crossings, exits and ways in, all of it reachable and leading to the boss),
 * its kinds (floor 0 all fights, elite floors and counts, caches, mysteries, siblings) and what fills
 * its rooms (real foes, no foe twice on a floor, three elements, real events, no event twice). Used by
 * the tests and by the server to refuse a bad stored map. Never throws, whatever it is given.
 */
export function dungeonMapValid(map: unknown, pack: MapContent = shipped()): map is DungeonMap {
  const parsed = v.safeParse(DungeonMapSchema, map);
  if (!parsed.success) return false;
  const { floors, nodes, level, crack } = parsed.output as DungeonMap;
  // The day's map is never an Undercroft level.
  if ((level !== undefined && level !== 0) || crack !== undefined) return false;
  const rules = RULES.dungeon;
  const m = rules.map;
  const last = rules.floors - 1;
  if (floors !== rules.floors) return false;

  // Shape: ids match their place, none twice, the right nodes on each floor.
  const byId = new Map<string, MapNode>();
  for (const n of nodes) {
    if (n.id !== nodeId(n.floor, n.lane) || n.floor > last || byId.has(n.id)) return false;
    byId.set(n.id, n);
  }
  const floorNodes = (f: number): MapNode[] => nodes.filter((n) => n.floor === f);
  for (let f = 0; f <= last; f++) {
    const lanes = floorNodes(f)
      .map((n) => n.lane)
      .sort((a, b) => a - b)
      .join();
    const single = f === rules.campFloor || f === last;
    const ok = single ? lanes === String(MIDDLE_LANE) : ['0,1,2', '0,1', '1,2'].includes(lanes);
    if (!ok) return false;
  }

  // Paths.
  const exits = (n: MapNode): MapNode[] => n.next.map((id) => byId.get(id) as MapNode);
  for (const n of nodes) {
    if (new Set(n.next).size !== n.next.length) return false;
    for (const id of n.next) {
      const to = byId.get(id);
      if (to === undefined || to.floor !== n.floor + 1 || Math.abs(to.lane - n.lane) > 1)
        return false;
    }
    if (n.floor === last) {
      if (n.next.length !== 0) return false;
      continue;
    }
    if (n.floor === rules.campFloor - 1) {
      // The floor before the camp leads only to the camp.
      if (n.next.length !== 1 || exits(n)[0]?.kind !== 'camp') return false;
    } else if (n.floor === rules.campFloor) {
      // The camp leads to every node of the next floor.
      if (n.next.length !== floorNodes(n.floor + 1).length) return false;
    } else if (n.next.length < 1 || n.next.length > 2) {
      return false;
    }
    if (n.floor === last - 1 && !(n.next.length === 1 && n.next[0] === nodeId(last, MIDDLE_LANE))) {
      return false;
    }
  }
  for (const n of nodes) {
    if (n.floor > 0 && !nodes.some((p) => p.next.includes(n.id))) return false;
  }
  for (const x of nodes) {
    for (const y of nodes) {
      if (x.floor !== y.floor || x.lane >= y.lane) continue;
      for (const c of exits(x)) for (const d of exits(y)) if (c.lane > d.lane) return false;
    }
  }
  // Everything is reachable from floor 0 and reaches the boss.
  const seen = new Set<string>(floorNodes(0).map((n) => n.id));
  for (let f = 0; f < last; f++) {
    for (const n of floorNodes(f)) if (seen.has(n.id)) for (const id of n.next) seen.add(id);
  }
  if (seen.size !== nodes.length) return false;

  // Kinds.
  for (const n of nodes) {
    if (n.floor === 0 && n.kind !== 'fight') return false;
    if (n.floor === rules.campFloor && n.kind !== 'camp') return false;
    if (n.floor === last && n.kind !== 'boss') return false;
    if (n.kind === 'camp' && n.floor !== rules.campFloor) return false;
    if (n.kind === 'boss' && n.floor !== last) return false;
    if (n.kind === 'elite' && !(m.eliteFloors as readonly number[]).includes(n.floor)) return false;
    if (n.kind === 'epic') return false;
    if (
      n.kind === 'door' &&
      !(rules.undercroft.doorFloors as readonly number[]).includes(n.floor)
    ) {
      return false;
    }
  }
  const ofKind = (kind: NodeKind): MapNode[] => nodes.filter((n) => n.kind === kind);
  if (ofKind('door').length > 1) return false;
  const elites = ofKind('elite').length;
  const mysteries = ofKind('mystery').length;
  if (elites < m.minElites || elites > m.maxElites) return false;
  if (ofKind('cache').length > m.maxCaches) return false;
  if (mysteries < m.minMysteries || mysteries > m.maxMysteries) return false;
  for (let f = 0; f <= last; f++) {
    if (floorNodes(f).filter((n) => n.kind === 'elite').length > 1) return false;
  }
  for (const n of nodes) {
    if (n.kind !== 'cache' && n.kind !== 'mystery') continue;
    if (siblingsOf(nodes, n).some((s) => s.kind === n.kind)) return false;
  }

  // Contents.
  const foes = new Map(pack.foes.map((f) => [f.id, f]));
  const modifiers = new Set(pack.modifiers.map((x) => x.id));
  const eventIds = new Set(pack.events.map((e) => e.id));
  const usedEvents = new Set<string>();
  const elements = new Set<string>();
  for (const n of nodes) {
    const holdsFoe = n.kind === 'fight' || n.kind === 'elite' || n.kind === 'boss';
    const foe = n.foeId === undefined ? undefined : foes.get(n.foeId);
    if (holdsFoe) {
      if (foe === undefined || foe.kind !== (n.kind === 'boss' ? 'boss' : 'foe')) return false;
      if (n.modifierId === undefined || !modifiers.has(n.modifierId)) return false;
      if (n.kind !== 'boss') elements.add(foe.element);
    } else if (n.foeId !== undefined || n.modifierId !== undefined) {
      return false;
    }
    if (n.kind === 'mystery') {
      if (n.eventId === undefined || !eventIds.has(n.eventId) || usedEvents.has(n.eventId))
        return false;
      usedEvents.add(n.eventId);
    } else if (n.eventId !== undefined) {
      return false;
    }
  }
  if (elements.size < m.minElements) return false;
  for (let f = 0; f < last; f++) {
    const ids = floorNodes(f)
      .map((n) => n.foeId)
      .filter((id): id is string => id !== undefined);
    if (new Set(ids).size !== ids.length) return false;
  }
  return true;
}

// --- The Undercroft's maps (docs/design/dungeon-paths.md, "The Undercroft") ---

/**
 * What a carved door can add to the Undercroft: one room of any kind but a boss, drawn when the player
 * steps through. It becomes a floor of its own, a single room.
 */
export const UNDERCROFT_MARKS = ['fight', 'elite', 'mystery', 'cache', 'camp', 'epic'] as const;
export type UndercroftMark = (typeof UNDERCROFT_MARKS)[number];

/** Draws what a carved door adds: `RULES.dungeon.undercroft.markOdds`, from the caller's live rng. */
export function drawMark(rng: Rng): UndercroftMark {
  const odds = RULES.dungeon.undercroft.markOdds;
  return pickWeighted<{ mark: UndercroftMark; weight: number }>(
    rng,
    UNDERCROFT_MARKS.map((mark) => ({ mark, weight: odds[mark] })),
  ).mark;
}

/** What an Undercroft level is drawn from. */
export interface UndercroftSpec {
  /** 1 for the first Undercroft, up to `RULES.dungeon.undercroft.maxLevels`. */
  level: number;
  /** Floors of two rooms before the marked floors and the keeper (`undercroftBaseFloors`). */
  floors: number;
  /** The marks the run has: each adds one floor of one room of that kind before the keeper. */
  marks: readonly UndercroftMark[];
}

/** The lanes of a floor of two rooms. They are never joined across: a lane is a path until a floor with one room. */
export const UNDERCROFT_LANES = [0, 2] as const;

type Shape = 'pair' | 'single';

/**
 * The floors of a level, bottom to top: the floors of two rooms, then the marked floors of one room
 * (every mark in the order it was drawn, but camps last: a rest before the keeper), then the keeper.
 */
function undercroftLayout(spec: UndercroftSpec): { shape: Shape; kind: NodeKind | null }[] {
  const marks = [
    ...spec.marks.filter((m) => m !== 'camp'),
    ...spec.marks.filter((m) => m === 'camp'),
  ];
  return [
    ...Array.from({ length: spec.floors }, () => ({ shape: 'pair' as const, kind: null })),
    ...marks.map((kind) => ({ shape: 'single' as const, kind: kind })),
    { shape: 'single' as const, kind: 'boss' },
  ];
}

/** The number of floors (the keeper's included) an Undercroft level of `spec` has. */
export function undercroftFloorCount(spec: UndercroftSpec): number {
  return spec.floors + spec.marks.length + 1;
}

export const undercroftNodeId = (level: number, floor: number, lane: number): string =>
  `u${String(level)}f${String(floor)}l${String(lane)}`;

/** The nodes of the floor above that a node leads to: straight up its lane, or to the single room (and from a single room to both). */
function undercroftNext(
  level: number,
  from: Shape,
  lane: number,
  to: Shape,
  floor: number,
): string[] {
  const lanes = to === 'pair' ? (from === 'pair' ? [lane] : [...UNDERCROFT_LANES]) : [MIDDLE_LANE];
  return lanes.map((l) => undercroftNodeId(level, floor + 1, l));
}

function drawUndercroftMap(rng: Rng, spec: UndercroftSpec, pack: MapContent): DungeonMap | null {
  const u = RULES.dungeon.undercroft;
  const m = RULES.dungeon.map;
  const layout = undercroftLayout(spec);
  const nodes: MapNode[] = [];
  layout.forEach(({ shape, kind }, floor) => {
    for (const lane of shape === 'pair' ? UNDERCROFT_LANES : [MIDDLE_LANE]) {
      const above = layout[floor + 1];
      nodes.push({
        id: undercroftNodeId(spec.level, floor, lane),
        floor,
        lane,
        kind: kind ?? 'fight',
        next:
          above === undefined ? [] : undercroftNext(spec.level, shape, lane, above.shape, floor),
      });
    }
  });

  // The rooms of the floors of two: the first floor is fights, the rest roll like the main map's rooms.
  const counts = { elite: 0, cache: 0, mystery: 0 };
  for (const node of nodes) {
    if (layout[node.floor]?.shape !== 'pair' || node.floor === 0) continue;
    const mate = nodes.find((n) => n.floor === node.floor && n.id !== node.id);
    const eliteOk = counts.elite < u.map.maxElites && mate?.kind !== 'elite';
    const cacheOk = counts.cache < u.map.maxCaches && mate?.kind !== 'cache';
    const mysteryOk = counts.mystery < u.map.maxMysteries && mate?.kind !== 'mystery';
    const kind = pickWeighted<{ kind: NodeKind; weight: number }>(rng, [
      { kind: 'fight', weight: m.kinds.fight },
      { kind: 'mystery', weight: mysteryOk ? m.kinds.mystery : 0 },
      { kind: 'cache', weight: cacheOk ? m.kinds.cache : 0 },
      { kind: 'elite', weight: eliteOk ? m.kinds.elite : 0 },
    ]).kind;
    node.kind = kind;
    if (kind === 'elite' || kind === 'cache' || kind === 'mystery') counts[kind] += 1;
  }

  // What fills them: a different normal foe for each room of a floor, a modifier each, the keeper (a
  // floor boss) and an event for each mystery room.
  const normal = pack.foes.filter((f) => f.kind === 'foe');
  const bosses = pack.foes.filter((f) => f.kind === 'boss');
  const modifier = (): string =>
    (pack.modifiers[int(rng, pack.modifiers.length)] as RoomModifierDef).id;
  for (let f = 0; f < layout.length - 1; f++) {
    const rooms = nodes.filter(
      (n) => n.floor === f && (n.kind === 'fight' || n.kind === 'elite' || n.kind === 'epic'),
    );
    const foes = shuffled(rng, normal);
    for (const [i, node] of rooms.entries()) {
      const foe = foes[i];
      if (foe === undefined) return null;
      node.foeId = foe.id;
      node.modifierId = modifier();
    }
  }
  const boss = bosses[int(rng, bosses.length || 1)];
  const keeper = nodes[nodes.length - 1];
  if (boss === undefined || keeper === undefined) return null;
  keeper.foeId = boss.id;
  keeper.modifierId = modifier();
  // A rare event is never drawn onto a map: a run meets it live as it steps into a mystery room.
  const events = shuffled(
    rng,
    pack.events.filter((e) => e.rare === undefined),
  );
  for (const [i, node] of nodes.filter((n) => n.kind === 'mystery').entries()) {
    const event = events[i];
    if (event === undefined) return null;
    node.eventId = event.id;
  }
  // The keeper's floor is cracked now and then (never on the deepest level), which opens another level.
  const crack = spec.level < u.maxLevels && chance(rng, u.crackBp, 10_000);
  return { floors: layout.length, nodes, level: spec.level, crack };
}

/**
 * Draws one Undercroft level from `rng` (the worker's live source: it is the player's own, drawn when
 * they descend). Floors of two rooms (fight, elite, mystery or cache, like the main map, never a camp),
 * then a floor of one room for each mark (any kind but a boss; camps last), then the keeper's floor: a
 * single floor boss. The same stream always gives the same map. Throws if the content cannot fill it.
 */
export function generateUndercroftMap(
  rng: Rng,
  spec: UndercroftSpec,
  pack: MapContent = shipped(),
): DungeonMap {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const map = drawUndercroftMap(rng, spec, pack);
    if (map !== null && undercroftMapValid(map, pack)) return map;
  }
  throw new Error('could not draw a valid undercroft map from the content');
}

/** The kinds of room a floor of one room may hold besides the keeper's. */
const SINGLE_KINDS: readonly NodeKind[] = UNDERCROFT_MARKS;

/**
 * True when `map` is a valid Undercroft level: ids `u<level>f<floor>l<lane>`, floors of two rooms
 * (lanes 0 and 2, each leading straight up its lane), then floors of one room (any kind but a boss,
 * camps last), then the keeper alone on the last floor; every room reachable, kinds within their caps,
 * real foes and events, no foe twice on a floor, and a crack only below the deepest level. Never throws,
 * whatever it is given.
 */
export function undercroftMapValid(map: unknown, pack: MapContent = shipped()): map is DungeonMap {
  const parsed = v.safeParse(DungeonMapSchema, map);
  if (!parsed.success) return false;
  const { floors, nodes, level, crack } = parsed.output as DungeonMap;
  const u = RULES.dungeon.undercroft;
  if (level === undefined || level < 1 || level > u.maxLevels) return false;
  if (typeof crack !== 'boolean' || (crack && level >= u.maxLevels)) return false;
  if (floors < 2 || nodes.length === 0) return false;
  const byId = new Map<string, MapNode>();
  for (const n of nodes) {
    if (n.id !== undercroftNodeId(level, n.floor, n.lane) || n.floor >= floors || byId.has(n.id)) {
      return false;
    }
    byId.set(n.id, n);
  }
  const floorNodes = (f: number): MapNode[] =>
    nodes.filter((n) => n.floor === f).sort((a, b) => a.lane - b.lane);

  // The shape: pairs first, then single rooms, the keeper last; camps after the other single rooms.
  const shapes: Shape[] = [];
  for (let f = 0; f < floors; f++) {
    const lanes = floorNodes(f)
      .map((n) => n.lane)
      .join();
    if (lanes === UNDERCROFT_LANES.join()) shapes.push('pair');
    else if (lanes === String(MIDDLE_LANE)) shapes.push('single');
    else return false;
  }
  const pairs = shapes.filter((s) => s === 'pair').length;
  if (pairs < 1 || shapes.slice(0, pairs).some((s) => s !== 'pair')) return false;
  if (shapes[floors - 1] !== 'single') return false;
  let sawCamp = false;
  for (let f = pairs; f < floors - 1; f++) {
    const kind = floorNodes(f)[0]?.kind;
    if (kind === 'camp') sawCamp = true;
    else if (sawCamp) return false;
  }

  // The paths.
  for (const n of nodes) {
    const above = shapes[n.floor + 1];
    const expected =
      above === undefined
        ? []
        : undercroftNext(level, shapes[n.floor] as Shape, n.lane, above, n.floor);
    if (n.next.length !== expected.length || !expected.every((id, i) => n.next[i] === id)) {
      return false;
    }
  }

  // Kinds. The caps count the floors of two rooms only: a marked room is a gift of the door.
  const counts = { elite: 0, cache: 0, mystery: 0 };
  for (const n of nodes) {
    const allowed: readonly NodeKind[] =
      n.floor === floors - 1
        ? ['boss']
        : shapes[n.floor] === 'single'
          ? SINGLE_KINDS
          : n.floor === 0
            ? ['fight']
            : ['fight', 'elite', 'mystery', 'cache'];
    if (!allowed.includes(n.kind)) return false;
    if (
      shapes[n.floor] === 'pair' &&
      (n.kind === 'elite' || n.kind === 'cache' || n.kind === 'mystery')
    ) {
      counts[n.kind] += 1;
    }
  }
  if (counts.elite > u.map.maxElites) return false;
  if (counts.cache > u.map.maxCaches) return false;
  if (counts.mystery > u.map.maxMysteries) return false;
  for (let f = 0; f < pairs; f++) {
    const here = floorNodes(f);
    for (const k of ['elite', 'cache', 'mystery'] as const) {
      if (here.filter((n) => n.kind === k).length > 1) return false;
    }
  }

  // Contents.
  const foes = new Map(pack.foes.map((x) => [x.id, x]));
  const modifiers = new Set(pack.modifiers.map((x) => x.id));
  const eventIds = new Set(pack.events.map((e) => e.id));
  const usedEvents = new Set<string>();
  for (const n of nodes) {
    const holdsFoe =
      n.kind === 'fight' || n.kind === 'elite' || n.kind === 'epic' || n.kind === 'boss';
    const foe = n.foeId === undefined ? undefined : foes.get(n.foeId);
    if (holdsFoe) {
      if (foe === undefined || foe.kind !== (n.kind === 'boss' ? 'boss' : 'foe')) return false;
      if (n.modifierId === undefined || !modifiers.has(n.modifierId)) return false;
    } else if (n.foeId !== undefined || n.modifierId !== undefined) {
      return false;
    }
    if (n.kind === 'mystery') {
      if (n.eventId === undefined || !eventIds.has(n.eventId) || usedEvents.has(n.eventId)) {
        return false;
      }
      usedEvents.add(n.eventId);
    } else if (n.eventId !== undefined) {
      return false;
    }
  }
  for (let f = 0; f < floors; f++) {
    const ids = floorNodes(f)
      .map((n) => n.foeId)
      .filter((id): id is string => id !== undefined);
    if (new Set(ids).size !== ids.length) return false;
  }
  return true;
}
