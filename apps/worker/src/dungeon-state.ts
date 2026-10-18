/**
 * The stored state of a map run of the daily dungeon (`dungeon_runs.state_json`) and what the client is
 * shown of it (`DungeonRunState`). Everything an open run is lives here: the map copied from the day at
 * the start, the base fight input (the row with its gear and the day's weather folded in, frozen),
 * the HP the row carries, the pack at risk, the keepsakes and whatever is waiting for an answer.
 *
 * The server owns all of it. Nothing in it comes from the client, and nothing in what is sent out
 * holds a seed: the seeds of the fights are in `dungeon_steps` only.
 */
import {
  RULES,
  abilitiesFor,
  dungeonContent,
  dungeonEvent,
  dungeonKeepsake,
  isLandmark,
  mapView,
  reachableNodes,
  type DungeonMap,
  type DungeonRunPack,
  type Element,
  type Role,
  type KeepsakeDef,
  type WeatherDay,
} from '@creatures/game';
import {
  rowMaxHp,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
} from '@creatures/engine';
import type {
  DungeonEventView,
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPendingView,
  DungeonRunState,
  DungeonStepLog,
} from './dungeon-types';

/** The engine's key for the one player of a solo run. Never shown to anyone. */
export const PLAYER = 'p1';

/** What a run is waiting for: the scene of a mystery room, or the camp's choice (its two stored offers). */
export type PendingState =
  null | { kind: 'event'; eventId: string } | { kind: 'camp'; offers: string[] };

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

/** The scene of a mystery room with its two options (the exact outcomes are in their descriptions). */
export function eventView(eventId: string): DungeonEventView | null {
  const def = dungeonEvent(eventId);
  if (def === undefined) return null;
  return {
    id: def.id,
    name: def.name,
    text: def.text,
    options: def.options.map((o) => ({ label: o.label, description: o.description })),
  };
}

function pendingView(pending: PendingState): DungeonPendingView {
  if (pending === null) return null;
  if (pending.kind === 'event') {
    const event = eventView(pending.eventId);
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
    at: st.at,
    path: [...st.path],
    reachable: open ? reachableNodes(st.map, st.at) : [],
    pending: meta.status === 'active' ? pendingView(st.pending) : null,
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
    })),
    keepsakes: keepsakeViews(st.keepsakes),
    pack: { ...st.pack },
    roomsCleared: st.roomsCleared,
    supply: st.supply,
    lastEvent: st.lastEvent === null ? null : { ...st.lastEvent },
    history: structuredClone(st.history),
  };
}
