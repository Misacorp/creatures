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
  addParts,
  campOffers,
  campRest,
  catchBreath,
  drawMark,
  dungeonEvent,
  dungeonKeepsakes,
  dungeonScrapPerRoom,
  emptyPack,
  generateUndercroftMap,
  int,
  isLandmark,
  mapNode,
  mergeMods,
  nodeFoe,
  rollRoomShard,
  nodeLoot,
  QUIET_ROOM,
  reachableNodes,
  resolveEvent,
  rollDungeonLoot,
  rollUndercroftChest,
  RULES,
  roomSpecForNode,
  undercroftBaseFloors,
  undercroftOpen,
  weatherSheet,
  type PartsBundle,
  type Rng,
  type WeatherDay,
} from '@creatures/game';
import {
  placeSlots,
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
  currentMap,
  heldKeepsakes,
  keepsakeView,
  maxHpOfRow,
  type RunState,
  type Seat,
} from './dungeon-state';
import type { Draft, GrantView } from './gear-grants';
import type {
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPack,
  DungeonStepLog,
} from './dungeon-types';
import { GameError } from './outcome';
import { drawSeed, slotFor } from './raid-resolve';
import { loadCreatures, type TeamCreature } from './raid-teams';

/** The supply a run's chest carries (the first fight cleared earns it; it is safe and never in the pack). */
export const SUPPLIES_PER_RUN = 1;

/** What a boss chest's dice give, before the grant pays it: parts, gear (with its origin) and supplies. */
export interface ChestDraw {
  parts: PartsBundle;
  gear: Draft['gear'];
  supplies?: string[];
}

export interface PathEnv {
  sql: SqlStorage;
  userId: string;
  /** Live randomness. Crypto in production. */
  rng: Rng;
  /** Live randomness for loot dice (the gear rng): a room's shard chance, so the fight's own draws do not move. */
  gearRng: Rng;
  analytics?: Analytics | undefined;
  /**
   * Pays a boss chest's gear, shards and supply now, once, under the stable key `<run>:<tag>` (`chest`,
   * or `u<level>` for an Undercroft keeper's), drawing its dice from the live gear rng. Answers what it gave.
   */
  bank: (tag: string, draw: (rng: Rng) => ChestDraw) => GrantView;
  /** Locks the player's depth in at `depth` (never lowers it): the main boss is beaten, whatever happens next. */
  lockDepth: (depth: number) => void;
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

/** A slot with the day's weather sheet folded in. */
function withWeather(slot: FightSlot, weather: WeatherDay | null): FightSlot {
  const mods = mergeMods(slot.mods, weatherSheet(weather, slot));
  return mods === undefined ? slot : { ...slot, mods };
}

/**
 * A creature's slot for a run stored before seats (`RunState.seats`): its stats and gear, with the day's
 * weather sheet folded in, but not its place in the row.
 */
function slotOf(creature: TeamCreature, weather: WeatherDay | null): FightSlot {
  return withWeather(slotFor(creature, PLAYER), weather);
}

/** The seats of creatures joining a run's row: each one's unplaced slot and its gear fold's kit. */
export function seatsOf(creatures: readonly TeamCreature[]): Record<string, Seat> {
  return Object.fromEntries(
    creatures.map((c): [string, Seat] => [c.id, { slot: slotFor(c, PLAYER), kit: c.kit }]),
  );
}

/**
 * A run's row in this order, from its seats: the gear folded again with where each creature stands (the
 * position lines and gear sets of one line, `placeSlots`), then the day's weather on every sheet.
 */
export function seatedRow(
  ids: readonly string[],
  seats: Readonly<Record<string, Seat>>,
  weather: WeatherDay | null,
): FightSlot[] {
  const seated = ids.map((id) => {
    const seat = seats[id];
    if (seat === undefined) throw new Error(`no seat for ${id}`);
    return seat;
  });
  const kits = new Map(seated.map((seat) => [seat.slot.id, seat.kit]));
  return placeSlots(
    seated.map((seat) => seat.slot),
    kits,
    'line',
  ).map((slot) => withWeather(slot, weather));
}

/**
 * Places the row again after the camp moved or swapped someone (a run with seats): its position lines see
 * the new neighbours. Only a creature whose max HP the new place changed (a Lantern bearer's gift) gets a
 * new max, and the HP it carries never stays above it; everyone else keeps the max of their last fight.
 */
function reseat(st: RunState): void {
  if (st.seats === undefined) return;
  const before = new Map(st.input.team.map((slot) => [slot.id, slot]));
  const team = seatedRow(
    st.input.team.map((slot) => slot.id),
    st.seats,
    st.weather,
  );
  if (JSON.stringify(team) === JSON.stringify(st.input.team)) return;
  st.input = { ...st.input, team, abilities: abilityChoices(team) };
  const changed = team
    .filter((slot) => before.get(slot.id)?.stats?.hp !== slot.stats?.hp)
    .map((slot) => slot.id);
  if (changed.length === 0) return;
  const max = maxHpOfRow(st.input, st.keepsakes);
  const hpMax = { ...st.hpMax };
  const hp = st.hp === null ? null : { ...st.hp };
  for (const id of changed) {
    const top = max[id];
    if (top === undefined) continue;
    hpMax[id] = top;
    const now = hp?.[id];
    if (hp !== null && now !== undefined && now > top) hp[id] = top;
  }
  st.hpMax = hpMax;
  st.hp = hp;
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

/**
 * The loot of a cleared room goes in the pack, with Market Day's scrap for a fight. In the Undercroft
 * fights, elites and caches pay `lootMultiplier` times as much (Market Day's scrap too). Returns what went in.
 */
function packLoot(
  st: RunState,
  kind: Parameters<typeof nodeLoot>[0],
  fight: boolean,
  shards?: DungeonPack['shards'],
): DungeonPack {
  const loot = nodeLoot(kind, st.level);
  const doubled =
    st.level > 0 && (kind === 'fight' || kind === 'elite' || kind === 'cache')
      ? RULES.dungeon.undercroft.lootMultiplier
      : 1;
  const gained = {
    ...loot,
    scrap: loot.scrap + (fight ? dungeonScrapPerRoom(st.weather) * doubled : 0),
    ...(shards === undefined ? {} : { shards }),
  };
  st.pack = addPack(st.pack, gained);
  return gained;
}

/**
 * Answers the entry a room left `pending` in the log (the mystery room or the camp the run is standing
 * in): it is replaced in place, so there is one entry per visited room. Without one it is added.
 */
function settleStep(st: RunState, entry: DungeonStepLog): void {
  const last = st.history[st.history.length - 1];
  if (last !== undefined && last.node === entry.node && last.result === 'pending') {
    st.history[st.history.length - 1] = entry;
  } else {
    st.history.push(entry);
  }
}

// --- Move ---

/** The ids of the row now, left to right. */
const rowIds = (st: RunState): string[] => st.input.team.map((slot) => slot.id);

/** Adds what a chest's grant gave to what the run has banked. */
function bankInto(st: RunState, view: GrantView): void {
  const had = st.banked;
  st.banked = {
    parts: addParts(had?.parts ?? {}, view.parts),
    gear: [...(had?.gear ?? []), ...view.gear],
    converted: [...(had?.converted ?? []), ...view.converted],
    supplies: [...(had?.supplies ?? []), ...(view.supplies ?? [])],
  };
}

/**
 * The main boss is beaten at a depth that opens the Undercroft: depth +1 is locked in, and the chest
 * opens now. Its gear, shard and supply are paid at once (key `chest`) and so can never be lost; its
 * Essence and scrap (the boss's loot, the full clear's, a landmark's) go into the pack with the rest.
 */
function openMainChest(env: PathEnv, st: RunState, node: MapNodeLike, depth: number): void {
  const landmark = isLandmark(depth);
  const element = nodeFoe(node, depth)?.element ?? 'tide';
  const view = env.bank('chest', (rng) => {
    const loot = rollDungeonLoot(
      rng,
      depth,
      {
        landmark,
        fullClear: true,
        bossCleared: true,
        supplies: st.supply ? SUPPLIES_PER_RUN : 0,
      },
      element,
    );
    return {
      parts: addParts({ glimmer: landmark ? RULES.dungeon.landmark.glimmer : 0 }, loot.parts),
      gear: loot.gear.map((item) => ({ item, origin: { kind: 'dungeon' as const, depth } })),
      supplies: loot.supplies,
    };
  });
  bankInto(st, view);
  const extras: DungeonPack = {
    bait: 0,
    essence: RULES.dungeon.fullClear.essence + (landmark ? RULES.dungeon.landmark.essence : 0),
    scrap: landmark ? RULES.dungeon.landmark.scrap : 0,
  };
  st.pack = addPack(st.pack, extras);
  env.lockDepth(depth + 1);
  st.history.push({
    node: node.id,
    kind: 'boss',
    result: 'chest',
    level: 0,
    // Only what the chest adds: the boss's own loot is in the fight's entry before this one.
    loot: extras,
    gear: view.gear.map(({ baseId, rarity, itemLevel }) => ({
      baseId,
      rarity,
      ...(itemLevel === undefined ? {} : { itemLevel }),
    })),
  });
}

type MapNodeLike = NonNullable<ReturnType<typeof mapNode>>;

/**
 * An Undercroft keeper is beaten: its chest's gear is paid now (key `u<level>`); its Essence and scrap are
 * already in the pack and on its fight entry, so the chest entry adds no loot.
 */
function openKeeperChest(env: PathEnv, st: RunState, node: MapNodeLike, depth: number): void {
  const level = st.level;
  const element = nodeFoe(node, depth, level)?.element ?? 'tide';
  const view = env.bank(`u${String(level)}`, (rng) => ({
    parts: {},
    gear: rollUndercroftChest(rng, depth, element).map((item) => ({
      item,
      origin: { kind: 'dungeon' as const, depth },
    })),
  }));
  bankInto(st, view);
  st.history.push({
    node: node.id,
    kind: 'boss',
    result: 'chest',
    level,
    loot: emptyPack(),
    gear: view.gear.map(({ baseId, rarity, itemLevel }) => ({
      baseId,
      rarity,
      ...(itemLevel === undefined ? {} : { itemLevel }),
    })),
  });
}

/** The way down is offered: the run waits for the player to head home or descend into `level`. */
function offerDescent(st: RunState, level: number): void {
  st.pending = { kind: 'descend', level };
  st.history.push({ node: st.at ?? '', kind: 'descend', result: 'pending', level });
}

/**
 * What a cleared boss room does to the run. The main boss, at a depth that opens the Undercroft, banks
 * its chest and offers the descent (below that depth the run simply ends cleared, and the run's end pays
 * the chest). An Undercroft keeper banks its chest, then offers another descent if its floor was cracked
 * (and the run has levels left), otherwise the run ends cleared. With nobody left standing there is
 * nobody to go on with: the run ends cleared.
 */
function bossCleared(env: PathEnv, st: RunState, node: MapNodeLike, depth: number): boolean {
  const u = RULES.dungeon.undercroft;
  if (st.level === 0) {
    st.bossCleared = true;
    st.fullClear = rowIds(st);
    if (!undercroftOpen(depth)) return false;
    openMainChest(env, st, node, depth);
    if (!someoneStands(st)) return false;
    offerDescent(st, 1);
    return true;
  }
  st.deepest = st.level;
  openKeeperChest(env, st, node, depth);
  if (currentMap(st).crack === true && st.level < u.maxLevels && someoneStands(st)) {
    offerDescent(st, st.level + 1);
    return true;
  }
  return false;
}

export function applyMove(env: PathEnv, st: RunState, nodeId: string, depth: number): ActOutcome {
  if (st.pending !== null) throw invalidAct('answer what is waiting first');
  const map = currentMap(st);
  if (!reachableNodes(map, st.at).includes(nodeId)) throw invalidAct('that room is not reachable');
  const node = mapNode(map, nodeId);
  if (node === undefined) throw invalidAct('that room is not on the map');
  st.at = nodeId;
  st.path.push(nodeId);
  // The line of the last mystery room is shown right after the pick; the next move clears it.
  st.lastEvent = null;

  switch (node.kind) {
    case 'fight':
    case 'elite':
    case 'epic':
    case 'boss': {
      const held = heldKeepsakes(st.keepsakes);
      const base = roomSpecForNode(map, nodeId, depth, st.fights);
      const spec: DungeonRoomSpec = held.length === 0 ? base : { ...base, keepsakes: held };
      // The seed is drawn now: a client can neither know it before nor pick it.
      const seed = drawSeed(env.rng);
      const input: DungeonRunInput = { ...st.input, rooms: [spec] };
      const hpIn = st.hp === null ? null : { ...st.hp };
      const result = simulateDungeonRoom(input, spec, hpIn, seed);
      const fight: PlayedFight = { node: nodeId, seed, input, hpIn, result };
      const standing = rowIds(st);
      st.fights += 1;
      st.hp = { ...result.result.hpEnd };
      st.hpMax = { ...st.hpMax, ...result.hpMax };
      const step = {
        node: nodeId,
        kind: node.kind,
        result: 'fight' as const,
        cleared: result.cleared,
        rounds: result.result.rounds,
        foeHpEnd: result.result.bossHpEnd,
        foeHpMax: result.result.bossHpStart,
      };
      if (!result.cleared) {
        st.history.push({ ...step, loot: { bait: 0, essence: 0, scrap: 0 } });
        return { fight, end: 'defeat' };
      }
      st.roomsCleared += 1;
      // A shard of the foe's element, by room kind (live randomness, rolled as the room is cleared).
      const shard = rollRoomShard(
        env.gearRng,
        node.kind,
        nodeFoe(node, depth, st.level)?.element ?? 'tide',
      );
      const loot = packLoot(st, node.kind, true, shard);
      st.tally = addFightsCleared(st.tally, standing);
      const earnedSupply = !st.supply;
      st.supply = true;
      let keepsake: DungeonKeepsakeView | null = null;
      if (node.kind === 'elite' || node.kind === 'epic') {
        if (node.kind === 'elite') st.elites += 1;
        const gift = drawKeepsake(env.rng, st.keepsakes);
        if (gift !== null) {
          st.keepsakes.push(gift);
          keepsake = keepsakeView(gift);
        }
      }
      st.history.push({
        ...step,
        loot,
        ...(keepsake === null ? {} : { keepsake }),
        ...(earnedSupply ? { supply: true } : {}),
      });
      if (node.kind === 'boss') {
        return bossCleared(env, st, node, depth) ? { fight } : { fight, end: 'cleared' };
      }
      // A fight that was won with nobody left standing leaves nobody to go on with.
      if (!someoneStands(st)) return { fight, end: 'defeat' };
      return { fight };
    }
    case 'cache':
      st.history.push({
        node: nodeId,
        kind: 'cache',
        result: 'cache',
        loot: packLoot(st, 'cache', false),
      });
      return {};
    case 'mystery': {
      // An event the content no longer has is a quiet room: nothing waits.
      if (node.eventId !== undefined && dungeonEvent(node.eventId) !== undefined) {
        st.pending = { kind: 'event', eventId: node.eventId };
        st.history.push({
          node: nodeId,
          kind: 'mystery',
          result: 'pending',
          event: dungeonEvent(node.eventId)?.name ?? '',
        });
      }
      return {};
    }
    case 'camp':
      // The two offers are drawn now and stored, so reloading the run does not reroll them.
      st.pending = { kind: 'camp', offers: campOffers(env.rng, st.keepsakes) };
      st.history.push({ node: nodeId, kind: 'camp', result: 'pending' });
      return {};
    case 'door': {
      // Below the depth that opens the Undercroft the door is a quiet room (its view says mystery): it
      // is logged like a mystery room that was answered, so the path shows it.
      if (!undercroftOpen(depth)) {
        st.history.push({
          node: nodeId,
          kind: 'mystery',
          result: 'event',
          event: QUIET_ROOM.name,
          option: '',
          outcome: 'A quiet room. Nothing happens here.',
          loot: { bait: 0, essence: 0, scrap: 0 },
        });
        return {};
      }
      // Stepping through adds one room, of a kind drawn now and not told: the Undercroft shows it when
      // it is drawn. At the most (`maxMarks`) the door adds nothing, and says so.
      const added = st.marks.length < RULES.dungeon.undercroft.maxMarks;
      if (added) st.marks.push(drawMark(env.rng));
      st.history.push({ node: nodeId, kind: 'door', result: 'door', added });
      return {};
    }
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
  const gained = resolved.keepsakesGained[0];
  const gainedView = gained === undefined ? null : keepsakeView(gained);
  settleStep(st, {
    node: st.at ?? '',
    kind: 'mystery',
    result: 'event',
    event: event.name,
    option: chosen.label,
    outcome: resolved.outcome,
    loot: { ...resolved.packDelta },
    ...(gainedView === null ? {} : { keepsake: gainedView }),
  });
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

  // What the log says of the choice (creature and keepsake names are plain text for the client to render as text).
  let detail = '';
  let taken: DungeonKeepsakeView | null = null;
  switch (act.choice) {
    case 'rest':
      st.hp = campRest(currentHp(st), st.hpMax);
      detail = `Rested: standing creatures recovered ${String(RULES.dungeon.camp.restBp / 100)}% HP.`;
      break;
    case 'keepsake': {
      if (act.keepsake === undefined || !offers.includes(act.keepsake)) {
        throw invalidAct('that keepsake is not on offer');
      }
      st.keepsakes.push(act.keepsake);
      taken = keepsakeView(act.keepsake);
      detail = `Took the ${taken?.name ?? 'keepsake'}.`;
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
      const incoming = slotOf(coming, st.weather);
      if (st.seats !== undefined) st.seats = { ...st.seats, ...seatsOf([coming]) };
      detail = `Swapped ${row[place]?.name ?? 'a creature'} out for ${incoming.name}.`;
      const next = [...row];
      next[place] = incoming;
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
  // The row is put in the order asked, for free. It is the row as the choice leaves it: after a swap
  // that includes the creature that came in (and not the one that went home), so a recruit can be
  // stood anywhere in the same act. Nothing else changes: no HP, no gear, no step of its own.
  if (act.order !== undefined) {
    const row = st.input.team;
    const ids = row.map((slot) => slot.id);
    const same =
      new Set(act.order).size === ids.length && act.order.every((id) => ids.includes(id));
    if (!same) throw invalidAct('the order is not the row');
    const team = act.order.map((id) => row.find((slot) => slot.id === id) as FightSlot);
    st.input = { ...st.input, team, abilities: abilityChoices(team) };
  }
  // With the row's order final, its gear is placed again (only a run with seats; the same row if nothing moved).
  reseat(st);
  st.campChoice = act.choice;
  settleStep(st, {
    node: st.at ?? '',
    kind: 'camp',
    result: 'camp',
    choice: act.choice,
    detail,
    ...(taken === null ? {} : { keepsake: taken }),
  });
  st.pending = null;
  env.analytics?.record({ kind: 'dungeon_camp', choice: act.choice }, env.userId);
  return {};
}

// --- Home ---

/**
 * How a run that heads home (or is closed at a safe point) ends: `home` before the main boss has been
 * beaten, `cleared` after it (the depth was won; the pack comes home whole either way).
 */
export function homeOutcome(st: Pick<RunState, 'bossCleared'>): DungeonOutcome {
  return st.bossCleared ? 'cleared' : 'home';
}

/** Heading home: from the camp, or from the descent card. Keeps the whole pack. */
export function applyHome(st: RunState): ActOutcome {
  const pending = st.pending;
  if (pending?.kind === 'descend') {
    settleStep(st, {
      node: st.at ?? '',
      kind: 'descend',
      result: 'home',
      level: pending.level,
    });
    st.pending = null;
    return { end: homeOutcome(st) };
  }
  if (pending?.kind !== 'camp')
    throw invalidAct('you can only head home from a camp or the descent');
  settleStep(st, {
    node: st.at ?? '',
    kind: 'camp',
    result: 'camp',
    choice: 'home',
    detail: 'Headed home with the pack.',
  });
  st.pending = null;
  return { end: homeOutcome(st) };
}

// --- Descend ---

/**
 * Goes down into the Undercroft level the run is offered. The level's map is drawn now with live
 * randomness (it is the player's own), stored with the run, and the row catches its breath on the way
 * (`catchBreathBp` of max HP for standing creatures; a fallen one gets back up at `reviveBp`, and the
 * entry says how many). The run then stands before the new map's floor 0.
 */
export function applyDescend(env: PathEnv, st: RunState, depth: number): ActOutcome {
  if (st.pending?.kind !== 'descend') throw invalidAct('there is no way down waiting');
  const level = st.pending.level;
  if (level !== st.under.length + 1 || level > RULES.dungeon.undercroft.maxLevels) {
    throw invalidAct('that level cannot be opened');
  }
  const map = generateUndercroftMap(env.rng, {
    level,
    floors: undercroftBaseFloors(depth, level),
    marks: level === 1 ? st.marks : [],
  });
  const before = currentHp(st);
  const after = catchBreath(before, st.hpMax);
  const healed = Object.keys(after).reduce((n, id) => n + (after[id] ?? 0) - (before[id] ?? 0), 0);
  const revived = Object.keys(before).filter(
    (id) => (before[id] ?? 0) <= 0 && (after[id] ?? 0) > 0,
  ).length;
  st.hp = after;
  st.under.push(map);
  st.level = level;
  settleStep(st, { node: st.at ?? '', kind: 'descend', result: 'descend', level, healed, revived });
  st.pending = null;
  st.at = null;
  env.analytics?.record({ kind: 'dungeon_descend', level }, env.userId);
  return {};
}
