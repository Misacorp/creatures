/**
 * The acts of a map run of the daily dungeon (docs/design/dungeon-paths.md): a move into a room, the
 * answer to a mystery room, the camp's choice and heading home. Each function takes the state of an
 * open run (already a private copy: a throw leaves nothing behind) and changes it. The dice are live:
 * the seed of a fight, an elite's keepsake, a gamble and the camp's offers are drawn from the injected
 * crypto-backed rng at the moment they are needed, never earlier and never from anything a player could
 * compute. Pure game rules come from `@creatures/game` and `@creatures/engine`; this file only wires
 * them to the stored state. Storage, payment and the response belong to `dungeon.ts`.
 */
import {
  addFightsCleared,
  addPack,
  campOffers,
  campRest,
  dungeonEvent,
  dungeonKeepsakes,
  dungeonScrapPerRoom,
  int,
  mapNode,
  mergeMods,
  nodeLoot,
  reachableNodes,
  resolveEvent,
  roomSpecForNode,
  weatherSheet,
  type Rng,
  type WeatherDay,
} from '@creatures/game';
import {
  simulateDungeonRoom,
  type DungeonRoomResult,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import type { Analytics } from './analytics';
import type { Act } from './dungeon-schemas';
import {
  PLAYER,
  abilityChoices,
  currentHp,
  heldKeepsakes,
  maxHpOfRow,
  type RunState,
} from './dungeon-state';
import type { DungeonOutcome } from './dungeon-types';
import { GameError } from './outcome';
import { drawSeed, slotFor } from './raid-resolve';
import { loadCreatures, type TeamCreature } from './raid-teams';

export interface PathEnv {
  sql: SqlStorage;
  userId: string;
  /** Live randomness. Crypto in production. */
  rng: Rng;
  analytics?: Analytics | undefined;
}

/** A fight that was just played, as stored in `dungeon_steps`. */
export interface PlayedFight {
  node: string;
  /** Drawn when the player stepped in. Stored for the replay's sake, never sent to anyone. */
  seed: string;
  /** The run's input with this room as its only room. */
  input: DungeonRunInput;
  /** The HP the row came in with (null: the run's first fight). */
  hpIn: Record<string, number> | null;
  result: DungeonRoomResult;
}

export interface ActOutcome {
  fight?: PlayedFight;
  /** Set when the act ended the run. */
  end?: DungeonOutcome;
}

const invalidAct = (reason: string): GameError => new GameError(400, 'invalid_act', reason);

/** A creature's slot for the dungeon: its stats and gear, with the day's weather sheet folded in. */
export function slotOf(creature: TeamCreature, weather: WeatherDay | null): FightSlot {
  const slot = slotFor(creature, PLAYER);
  const mods = mergeMods(slot.mods, weatherSheet(weather, slot));
  return mods === undefined ? slot : { ...slot, mods };
}

/** Some creature of the row is still on its feet. */
function someoneStands(st: RunState): boolean {
  const hp = currentHp(st);
  return st.input.team.some((slot) => (hp[slot.id] ?? 0) > 0);
}

/** A random keepsake the run does not hold, or null when it holds them all. */
function drawKeepsake(rng: Rng, held: readonly string[]): string | null {
  const left = dungeonKeepsakes.filter((k) => !held.includes(k.id));
  const pick = left[int(rng, left.length || 1)];
  return pick === undefined ? null : pick.id;
}

/** The loot of a cleared room goes in the pack, with Market Day's scrap for a fight. */
function packLoot(st: RunState, kind: Parameters<typeof nodeLoot>[0], fight: boolean): void {
  const loot = nodeLoot(kind);
  st.pack = addPack(st.pack, {
    ...loot,
    scrap: loot.scrap + (fight ? dungeonScrapPerRoom(st.weather) : 0),
  });
}

// --- Move ---

export function applyMove(env: PathEnv, st: RunState, nodeId: string, depth: number): ActOutcome {
  if (st.pending !== null) throw invalidAct('answer what is waiting first');
  if (!reachableNodes(st.map, st.at).includes(nodeId))
    throw invalidAct('that room is not reachable');
  const node = mapNode(st.map, nodeId);
  if (node === undefined) throw invalidAct('that room is not on the map');
  st.at = nodeId;
  st.path.push(nodeId);

  switch (node.kind) {
    case 'fight':
    case 'elite':
    case 'boss': {
      const held = heldKeepsakes(st.keepsakes);
      const base = roomSpecForNode(st.map, nodeId, depth, st.fights);
      const spec: DungeonRoomSpec = held.length === 0 ? base : { ...base, keepsakes: held };
      // The seed is drawn now: a client can neither know it before nor pick it.
      const seed = drawSeed(env.rng);
      const input: DungeonRunInput = { ...st.input, rooms: [spec] };
      const hpIn = st.hp === null ? null : { ...st.hp };
      const result = simulateDungeonRoom(input, spec, hpIn, seed);
      const fight: PlayedFight = { node: nodeId, seed, input, hpIn, result };
      const standing = st.input.team.map((slot) => slot.id);
      st.fights += 1;
      st.hp = { ...result.result.hpEnd };
      st.hpMax = { ...st.hpMax, ...result.hpMax };
      if (!result.cleared) return { fight, end: 'defeat' };
      st.roomsCleared += 1;
      packLoot(st, node.kind, true);
      st.tally = addFightsCleared(st.tally, standing);
      st.supply = true;
      if (node.kind === 'elite') {
        st.elites += 1;
        const gift = drawKeepsake(env.rng, st.keepsakes);
        if (gift !== null) st.keepsakes.push(gift);
      }
      if (node.kind === 'boss') return { fight, end: 'cleared' };
      // A fight that was won with nobody left standing leaves nobody to go on with.
      if (!someoneStands(st)) return { fight, end: 'defeat' };
      return { fight };
    }
    case 'cache':
      packLoot(st, 'cache', false);
      return {};
    case 'mystery': {
      // An event the content no longer has is a quiet room: nothing waits.
      if (node.eventId !== undefined && dungeonEvent(node.eventId) !== undefined) {
        st.pending = { kind: 'event', eventId: node.eventId };
      }
      return {};
    }
    case 'camp':
      // The two offers are drawn now and stored, so reloading the run does not reroll them.
      st.pending = { kind: 'camp', offers: campOffers(env.rng, st.keepsakes) };
      return {};
  }
}

// --- Event ---

export function applyEvent(env: PathEnv, st: RunState, option: 0 | 1): ActOutcome {
  if (st.pending?.kind !== 'event') throw invalidAct('no mystery room is waiting');
  const event = dungeonEvent(st.pending.eventId);
  if (event === undefined) throw invalidAct('that scene is gone');
  const chosen = event.options[option];
  if (chosen === undefined) throw invalidAct('no such option');
  const resolved = resolveEvent(
    event,
    option,
    { hp: currentHp(st), hpMax: st.hpMax, keepsakes: st.keepsakes },
    env.rng,
  );
  st.hp = resolved.hp;
  st.pack = addPack(st.pack, resolved.packDelta);
  st.keepsakes.push(...resolved.keepsakesGained);
  st.lastEvent = { name: event.name, option: chosen.label, outcome: resolved.outcome };
  st.pending = null;
  env.analytics?.record(
    {
      kind: 'dungeon_event',
      event: event.id,
      option,
      ...(resolved.won === null ? {} : { won: resolved.won }),
    },
    env.userId,
  );
  return {};
}

// --- Camp ---

type CampAct = Extract<Act, { type: 'camp' }>;

export function applyCamp(env: PathEnv, st: RunState, act: CampAct): ActOutcome {
  if (st.pending?.kind !== 'camp') throw invalidAct('the camp is not waiting');
  const offers = st.pending.offers;
  // Only the fields of the choice are allowed: a stray one is a mistake worth refusing.
  if (act.choice !== 'swap' && (act.out !== undefined || act.in !== undefined)) {
    throw invalidAct('out and in are for a swap');
  }
  if (act.choice !== 'keepsake' && act.keepsake !== undefined) {
    throw invalidAct('keepsake is for a keepsake');
  }

  // The row is reordered first, for free.
  if (act.order !== undefined) {
    const ids = st.input.team.map((slot) => slot.id);
    const same =
      new Set(act.order).size === ids.length && act.order.every((id) => ids.includes(id));
    if (!same) throw invalidAct('the order is not the row');
    st.input = {
      ...st.input,
      team: act.order.map((id) => st.input.team.find((slot) => slot.id === id) as FightSlot),
    };
    st.input.abilities = abilityChoices(st.input.team);
  }

  switch (act.choice) {
    case 'rest':
      st.hp = campRest(currentHp(st), st.hpMax);
      break;
    case 'keepsake': {
      if (act.keepsake === undefined || !offers.includes(act.keepsake)) {
        throw invalidAct('that keepsake is not on offer');
      }
      st.keepsakes.push(act.keepsake);
      break;
    }
    case 'swap': {
      if (act.out === undefined || act.in === undefined)
        throw invalidAct('a swap needs out and in');
      const row = st.input.team;
      const place = row.findIndex((slot) => slot.id === act.out);
      if (place < 0) throw invalidAct('out is not in the row');
      if (row.some((slot) => slot.id === act.in)) throw invalidAct('in is already in the row');
      // A creature that stood in the row once does not come back (a camp comes once, so this cannot
      // happen today; it keeps a run from ever counting a creature twice).
      if (st.everyone.includes(act.in)) throw invalidAct('in was in the row already');
      // The same answer for a creature that does not exist (fused away, released) and one that belongs
      // to someone else. It is loaded without the gear the run already carries: an item taken off a
      // creature of the row and put on this one still counts once.
      const coming = loadCreatures(env.sql, env.userId, new Set(st.gear)).find(
        (c) => c.id === act.in,
      );
      if (coming === undefined) throw new GameError(404, 'not_found');
      st.gear.push(...coming.gearIds);
      const leaving = act.out;
      const next = [...row];
      next[place] = slotOf(coming, st.weather);
      // Its gear and weather sheet are loaded now and frozen for the rest of the run. It is not rested
      // (it starts at full HP) and carries no treat.
      const rest = { ...st.input.rest };
      delete rest[leaving];
      if (coming.gearRules.restBp > 0) rest[coming.id] = coming.gearRules.restBp;
      const withoutRest = { ...st.input };
      delete withoutRest.rest;
      st.input = {
        ...withoutRest,
        team: next,
        abilities: abilityChoices(next),
        ...(Object.keys(rest).length === 0 ? {} : { rest }),
      };
      if (st.hp !== null) {
        const hp = { ...st.hp };
        delete hp[leaving];
        delete hp[coming.id]; // no entry: the engine starts it at full HP
        st.hp = hp;
      }
      const max = { ...st.hpMax };
      delete max[leaving];
      max[coming.id] = maxHpOfRow(st.input, st.keepsakes)[coming.id] ?? 0;
      st.hpMax = max;
      if (!st.everyone.includes(coming.id)) st.everyone.push(coming.id);
      break;
    }
  }
  st.campChoice = act.choice;
  st.pending = null;
  env.analytics?.record({ kind: 'dungeon_camp', choice: act.choice }, env.userId);
  return {};
}

// --- Home ---

export function applyHome(st: RunState): ActOutcome {
  if (st.pending?.kind !== 'camp') throw invalidAct('you can only head home from the camp');
  st.pending = null;
  return { end: 'home' };
}
