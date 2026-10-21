/**
 * The stored state of a map run of the daily dungeon (`dungeon_runs.state_json`) and what the client is
 * shown of it (`DungeonRunState`). Everything an open run is lives here: the map copied from the day at
 * the start, the base fight input (the row with its gear and the day's weather folded in, frozen),
 * the HP the row carries, the pack at risk, the keepsakes and whatever is waiting for an answer.
 *
 * The server owns all of it. Nothing in it comes from the client, and nothing in what is sent out
 * holds a seed: the seeds of the fights are in `dungeon_steps` only.
 */
import { previewItemView } from './gear-access';
import {
  RULES,
  abilitiesFor,
  itemLines,
  undercroftBaseFloors,
  undercroftFloorCount,
  type GearRarity,
  type PartsBundle,
  type UndercroftMark,
  dungeonContent,
  dungeonEvent,
  dungeonKeepsake,
  isLandmark,
  mapNode,
  mapView,
  reachableNodes,
  type DungeonMap,
  type DungeonRunPack,
  type Treasure,
  type Element,
  type Role,
  type FoldKit,
  type GearItem,
  type KeepsakeDef,
  type WeatherDay,
} from '@creatures/game';
import {
  rowMaxHp,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import type {
  DungeonBankedView,
  DungeonEventView,
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPendingView,
  DungeonRunGear,
  DungeonRunState,
  DungeonStepLog,
  DungeonTreasureView,
} from './dungeon-types';

/** The items a creature carries in a run (its seat's frozen kit), as the gear list draws them. */
export function runGearView(items: readonly GearItem[]): DungeonRunGear[] {
  return items.map((item) => ({
    baseId: item.baseId,
    slot: item.slot,
    rarity: item.rarity,
    itemLevel: item.itemLevel,
    lines: itemLines(item).map((l) => l.text),
  }));
}

/** The engine's key for the one player of a solo run. Never shown to anyone. */
export const PLAYER = 'p1';

/**
 * What a run is waiting for: the scene of a mystery room, the camp's choice (its two stored offers), or
 * the choice to head home or go down into Undercroft level `level` (a safe point: closing there is home).
 */
export type PendingState =
  | null
  | { kind: 'event'; eventId: string; treasure?: Treasure }
  | { kind: 'camp'; offers: string[] }
  | { kind: 'descend'; level: number };

/** What the boss chests already gave, kept to show on the descent card and to add to the summary's rewards at the end. */
export interface BankedRewards {
  parts: PartsBundle;
  gear: { id: string; baseId: string; rarity: GearRarity; itemLevel?: number }[];
  converted: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  supplies: string[];
}

/** One creature's seat in a run's row: its unplaced slot and its gear fold's kit (`RunState.seats`). */
export interface Seat {
  slot: FightSlot;
  kit: FoldKit;
}

export interface RunState {
  /** Bumped when the stored shape changes. */
  v: 1;
  /** The day's map as it was when the run started: a content change during the day never reaches it. */
  map: DungeonMap;
  /**
   * The base fight input: the row now (gear and weather folded into each slot, frozen at the start or
   * when a creature was swapped in), abilities, the between-fight rest, luck, rules, enrage and depth.
   * `rooms` is always empty here: a fight adds its own room.
   */
  input: DungeonRunInput;
  /** The day's weather, fixed at the start (the sheet of a creature swapped in later, Market Day's scrap, the experience). */
  weather: WeatherDay | null;
  /**
   * By creature id, everyone who stood in the row: its slot before its place and the weather are known
   * (`slotFor`) and its gear fold's kit, both frozen when it joined. The row is placed again from them
   * after a camp swap or reorder, so the position lines and gear sets see the new neighbours (`seatedRow`).
   * Absent in a state stored before them: the camp then keeps every slot as it was.
   */
  seats?: Record<string, Seat>;
  /** Every creature that stood in the row at any time, in the order they came (the start team first). */
  everyone: string[];
  /** The creatures of the start team that carry a treat. */
  treats: string[];
  /** The starting row, left to right, for the replay's top-level `row` (the row changes at the camp). */
  start: {
    id: string;
    name: string;
    speciesId: string;
    element: Element;
    role: Role;
    level: number;
  }[];
  /**
   * The ids of the gear items frozen into the row (at the start and at each swap). A creature that joins
   * later is loaded without them, so an item moved to it from a creature of the row counts once.
   */
  gear: string[];
  /** How many creatures of the start team wore gear (for the analytics event). */
  gearWorn: number;
  /** The number of acts done so far: the `step` the next act must carry. */
  step: number;
  at: string | null;
  path: string[];
  pending: PendingState;
  /** HP the row carries; null before the first fight (everyone is at full HP). A creature with no entry is at full HP. */
  hp: Record<string, number> | null;
  /** Max HP by creature id: the last fight's, or `rowMaxHp` for a creature that has not fought yet. */
  hpMax: Record<string, number>;
  /** The keepsake ids the run holds, in the order they were won. */
  keepsakes: string[];
  /** The loot at risk. */
  pack: DungeonRunPack;
  /** Fights cleared (the boss included). */
  roomsCleared: number;
  /** Fights played so far (the index of the next one). */
  fights: number;
  /** Fights cleared by each creature that stood in the row for them (experience is paid from it at the end). */
  tally: Record<string, number>;
  /** The first fight was cleared: the run's supply is earned. */
  supply: boolean;
  lastEvent: { name: string; option: string; outcome: string } | null;
  /** What the camp's choice was, once made. */
  campChoice: 'rest' | 'swap' | 'keepsake' | null;
  /** Elites cleared. */
  elites: number;
  /** One entry per visited room, in order (no fight events). A run stored before the log has none. */
  history: DungeonStepLog[];
  /** The level the run stands in: 0 is `map`, level n is `under[n - 1]`. Absent in a state stored before the Undercroft. */
  level: number;
  /** The Undercroft levels drawn so far (the player's own, drawn when they descended). */
  under: DungeonMap[];
  /** What the carved door added, in order (kinds of room). Only the first Undercroft uses them. */
  marks: UndercroftMark[];
  /** The main boss was beaten: depth is locked in, whatever happens next. */
  bossCleared: boolean;
  /** The ids of the row that beat the main boss: the full-clear experience is theirs. Absent before the Undercroft (the row at the end). */
  fullClear?: string[];
  /** Undercroft levels cleared (keepers beaten). */
  deepest: number;
  /** The gear, supply and shards the boss chests paid already (their grant keys are stable). Null: the run's end pays the chest. */
  banked: BankedRewards | null;
  /**
   * The bag was full (at or over the cap) when the run started: the gear the run finds becomes parts.
   * Under the cap, everything it finds goes in. Absent in a state stored before: decided at each grant.
   */
  bagFull?: boolean;
  /** The treasures the run took (the Blue Chasm's): paid at the run's end unless it ended in a defeat. Absent before the chasm: none. */
  treasures: Treasure[];
  /** The ids of the rare events the run met (one at most each run, taken or not). Absent before the chasm: none. */
  rareSeen: string[];
}

/** Reads a stored state, or null when it is missing or is not a state this code wrote. */
export function parseState(json: string | null): RunState | null {
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as Partial<RunState> | null;
    if (parsed === null || typeof parsed !== 'object' || parsed.v !== 1) return null;
    // A state stored before the gear ids were kept holds none.
    parsed.gear ??= [];
    // A state stored before the room log has no history.
    if (!Array.isArray(parsed.history)) parsed.history = [];
    // A state stored before the Undercroft stands on the main map.
    parsed.level ??= 0;
    parsed.under ??= [];
    parsed.marks ??= [];
    parsed.bossCleared ??= false;
    parsed.deepest ??= 0;
    parsed.banked ??= null;
    // A state stored before the Blue Chasm took no treasure and met no rare room.
    parsed.treasures ??= [];
    parsed.rareSeen ??= [];
    return parsed as RunState;
  } catch {
    return null;
  }
}

/**
 * The engine's ability choices of a row: every unlocked creature ability, each firing at its default
 * round. There is no basic ability and the player sets no rounds. The key follows the creature's place
 * in the row, so it is worked out again whenever the row changes.
 */
export function abilityChoices(
  row: readonly { id: string; speciesId: string; level: number }[],
): AbilityChoice[] {
  return abilitiesFor(row, (c) => c.level).map((source) => ({
    playerId: PLAYER,
    abilityId: source.abilityId,
    key: `${PLAYER}:c${String(row.findIndex((c) => c.id === source.creatureId))}`,
    creatureId: source.creatureId,
  }));
}

/** The keepsakes the run holds, as content, in the order they were won (an id the content lost is skipped). */
export function heldKeepsakes(ids: readonly string[]): KeepsakeDef[] {
  return ids.flatMap((id) => {
    const def = dungeonKeepsake(id);
    return def === undefined ? [] : [def];
  });
}

/** A room with no foe worth the name and no modifier, to ask the engine for the row's max HP outside a fight. */
export function neutralRoom(keepsakes: readonly KeepsakeDef[]): DungeonRoomSpec {
  const foe = dungeonContent.foes[0];
  if (foe === undefined) throw new Error('content has no dungeon foe');
  return {
    index: 0,
    foe,
    modifier: { id: 'none', name: 'None', description: 'No modifier.', effects: [] },
    hp: 1,
    atk: 1,
    ...(keepsakes.length === 0 ? {} : { keepsakes: [...keepsakes] }),
  };
}

/** The row's max HP outside a fight, from its stats and the keepsakes held. */
export function maxHpOfRow(
  input: DungeonRunInput,
  keepsakes: readonly string[],
): Record<string, number> {
  return rowMaxHp(input, neutralRoom(heldKeepsakes(keepsakes)));
}

/** The map the run stands on: the day's map, or the Undercroft level it went down into. */
export function currentMap(st: Pick<RunState, 'level' | 'map' | 'under'>): DungeonMap {
  return st.level === 0 ? st.map : (st.under[st.level - 1] ?? st.map);
}

/** A node of any map of the run (the main map's or an Undercroft level's), or undefined. */
export function runNode(
  st: Pick<RunState, 'map' | 'under'>,
  id: string,
): ReturnType<typeof mapNode> {
  for (const map of [st.map, ...st.under]) {
    const found = mapNode(map, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The HP of every creature of the row now: what it carries, or its max when it has not fought yet. */
export function currentHp(st: RunState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of st.input.team) {
    const max = st.hpMax[slot.id] ?? 0;
    out[slot.id] = Math.min(max, st.hp?.[slot.id] ?? max);
  }
  return out;
}

export function keepsakeView(id: string): DungeonKeepsakeView | null {
  const def = dungeonKeepsake(id);
  return def === undefined ? null : { id: def.id, name: def.name, description: def.description };
}

export function keepsakeViews(ids: readonly string[]): DungeonKeepsakeView[] {
  return ids.flatMap((id) => {
    const view = keepsakeView(id);
    return view === null ? [] : [view];
  });
}

/**
 * A treasure as the client is shown it: the rolled piece itself, the blueprint's base, the supplies or the
 * parts. With `cardDepth` (the room that is still waiting for the choice) a gear piece carries its full card.
 */
export function treasureView(treasure: Treasure, cardDepth?: number): DungeonTreasureView {
  switch (treasure.kind) {
    case 'gear':
      return {
        kind: 'gear',
        baseId: treasure.item.baseId,
        rarity: treasure.item.rarity,
        itemLevel: treasure.item.itemLevel,
        // The pending room also sends the piece's full card (the stored item's own stats and lines, not a re-roll).
        ...(cardDepth === undefined ? {} : { card: previewItemView(treasure.item, cardDepth) }),
      };
    case 'blueprint':
      return { kind: 'blueprint', baseId: treasure.baseId };
    case 'supplies':
      return { kind: 'supplies', supplyId: treasure.supplyId, count: treasure.count };
    case 'shards':
      return { kind: 'shards', parts: { ...treasure.parts } };
  }
}

/** The scene of a mystery room with its two options (the exact outcomes are in their descriptions) and its treasure, if it rolled one. */
export function eventView(
  eventId: string,
  treasure?: Treasure,
  depth?: number,
): DungeonEventView | null {
  const def = dungeonEvent(eventId);
  if (def === undefined) return null;
  return {
    id: def.id,
    name: def.name,
    text: def.text,
    options: def.options.map((o) => ({ label: o.label, description: o.description })),
    ...(treasure === undefined ? {} : { treasure: treasureView(treasure, depth) }),
  };
}

/** The floors of the level a descent opens (the keeper's included): the first has the marks, a deeper one has its own two. */
export function descentFloors(st: Pick<RunState, 'marks'>, depth: number, level: number): number {
  return undercroftFloorCount({
    level,
    floors: undercroftBaseFloors(depth, level),
    marks: level === 1 ? st.marks : [],
  });
}

function bankedView(banked: BankedRewards | null): DungeonBankedView {
  return {
    gear: (banked?.gear ?? []).map((g) => ({
      baseId: g.baseId,
      rarity: g.rarity,
      ...(g.itemLevel === undefined ? {} : { itemLevel: g.itemLevel }),
    })),
    supplies: [...(banked?.supplies ?? [])],
    parts: { ...banked?.parts },
  };
}

function pendingView(st: RunState, depth: number): DungeonPendingView {
  const pending = st.pending;
  if (pending === null) return null;
  if (pending.kind === 'descend') {
    return {
      kind: 'descend',
      level: pending.level,
      floors: descentFloors(st, depth, pending.level),
      depthBonus: RULES.dungeon.undercroft.depthBonus,
      catchBreathBp: RULES.dungeon.undercroft.catchBreathBp,
      reviveBp: RULES.dungeon.undercroft.reviveBp,
      newDepth: depth + 1,
      banked: bankedView(st.banked),
    };
  }
  if (pending.kind === 'event') {
    const event = eventView(pending.eventId, pending.treasure, depth);
    return event === null ? null : { kind: 'event', event };
  }
  return {
    kind: 'camp',
    offers: keepsakeViews(pending.offers),
    restBp: RULES.dungeon.camp.restBp,
  };
}

/** The columns of a run row that the client's state shows. */
export interface RunMeta {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  status: 'active' | 'done';
  outcome: DungeonOutcome | null;
}

/**
 * What the client is shown of a run: the map at the run's depth, where it stands, what it may do next,
 * the row with its HP, the keepsakes and the pack. `reachable` is empty while something is pending or
 * once the run is done.
 */
export function runView(meta: RunMeta, st: RunState): DungeonRunState {
  const hp = currentHp(st);
  const treated = new Set(st.treats);
  const open = meta.status === 'active' && st.pending === null;
  return {
    id: meta.id,
    day: meta.day,
    attempt: meta.attempt,
    depth: meta.depth,
    landmark: isLandmark(meta.depth),
    status: meta.status,
    outcome: meta.outcome,
    step: st.step,
    map: mapView(st.map, meta.depth),
    level: st.level,
    undercroft:
      st.under.length === 0 && st.marks.length === 0
        ? null
        : { maps: st.under.map((m) => mapView(m, meta.depth)), marks: st.marks.length },
    at: st.at,
    path: [...st.path],
    reachable: open ? reachableNodes(currentMap(st), st.at) : [],
    pending: meta.status === 'active' ? pendingView(st, meta.depth) : null,
    team: st.input.team.map((slot) => ({
      id: slot.id,
      name: slot.name,
      speciesId: slot.speciesId,
      element: slot.element,
      role: slot.role,
      level: slot.level,
      hp: hp[slot.id] ?? 0,
      hpMax: st.hpMax[slot.id] ?? 0,
      treat: treated.has(slot.id),
      gear: runGearView(st.seats?.[slot.id]?.kit.items ?? []),
    })),
    keepsakes: keepsakeViews(st.keepsakes),
    pack: { ...st.pack },
    roomsCleared: st.roomsCleared,
    supply: st.supply,
    lastEvent: st.lastEvent === null ? null : { ...st.lastEvent },
    history: structuredClone(st.history),
  };
}
