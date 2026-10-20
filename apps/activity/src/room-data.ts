/**
 * The living room's data rules (pure): who the room still has to ask the server about, how answers
 * are merged, when everything counts as stale, and how the player's own resident is built from the
 * game state without any request. `room-loader.ts` runs them against the API and `use-room.ts` hands
 * the result to the screen.
 */
import { RULES, isRested } from '@creatures/game';
import type { Creature, GameState, LoungeSpot, RoomCreature, RoomResident } from './api';
import type { GearItem } from './gear-types';
import { wornItemOf, type WornItem } from './gear-view';

/** The server takes at most this many ids in one room request. */
export const ROOM_CHUNK = 25;
/** A burst of joins is one request: wait this long after the last participant update. */
export const ROOM_DEBOUNCE_MS = 2000;
/** A tab switch refetches the whole room only when the last full fetch is older than this. */
export const ROOM_STALE_MS = 60_000;
/** While someone else is here and the page is visible, everyone is refetched this often. */
export const ROOM_POLL_MS = 45_000;

/**
 * A creature on a couch. Like the server's `RoomCreature`, but the Crafting level can be missing for
 * your own creature until the gear view has loaded.
 */
export type ResidentCreature = Omit<RoomCreature, 'craftingLevel' | 'gear'> & {
  craftingLevel: number | null;
  /** The worn items; for your own creature without their lines until the gear view has loaded. */
  gear: WornItem[];
};

export interface Resident {
  userId: string;
  name: string;
  /** Null when every creature of the player is busy. */
  creature: ResidentCreature | null;
  /** The spot this player chose, or null (the room decides). Seated first, oldest first. */
  spot: LoungeSpot | null;
}

/** Splits a list into pieces of at most `size` (the room request's id limit). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const pieces: T[][] = [];
  for (let i = 0; i < items.length; i += size) pieces.push(items.slice(i, i + size));
  return pieces;
}

/** `present` without repeats and without the player (their resident is built locally). */
export function othersOf(present: readonly string[], selfId: string): string[] {
  return [...new Set(present)].filter((id) => id !== selfId);
}

/** The ids present that are not known yet (the only ones a join has to ask about). */
export function idsToFetch(
  present: readonly string[],
  known: ReadonlyMap<string, unknown>,
  selfId: string,
  pending: ReadonlySet<string> = new Set(),
): string[] {
  return othersOf(present, selfId).filter((id) => !known.has(id) && !pending.has(id));
}

/** The known residents of those still present: leavers drop out, with no request. */
export function dropAbsent<T>(
  known: ReadonlyMap<string, T>,
  present: readonly string[],
): Map<string, T> {
  const here = new Set(present);
  return new Map([...known].filter(([id]) => here.has(id)));
}

/** Known residents with an answer laid over them; answers about people who left meanwhile are ignored. */
export function mergeResidents(
  known: ReadonlyMap<string, Resident>,
  answer: readonly RoomResident[],
  present: readonly string[],
): Map<string, Resident> {
  const here = new Set(present);
  const next = new Map(known);
  for (const resident of answer) {
    if (here.has(resident.userId)) next.set(resident.userId, resident);
  }
  return next;
}

/** True when there was no full fetch yet, or the last one is more than `ROOM_STALE_MS` old. */
export function isStale(
  lastFullFetchAt: number | null,
  now: number,
  limit: number = ROOM_STALE_MS,
): boolean {
  return lastFullFetchAt === null || now - lastFullFetchAt > limit;
}

/**
 * Whether the slow refresh should be running: only while somebody other than the player is present and
 * the page is visible. Alone or hidden, nothing is asked and no timer waits.
 */
export function shouldPoll(present: readonly string[], selfId: string, hidden: boolean): boolean {
  return !hidden && othersOf(present, selfId).length > 0;
}

/**
 * Whether the lounge's live socket should be open: the server offers it, the player has a room, the page
 * is visible and somebody else is here (alone, a push could not matter). Otherwise it is closed and costs
 * nothing, like the poll.
 */
export function shouldOpenSocket(
  options: { enabled: boolean; offered: boolean; hidden: boolean },
  present: readonly string[],
  selfId: string,
): boolean {
  return (
    options.enabled && options.offered && !options.hidden && othersOf(present, selfId).length > 0
  );
}

/**
 * How often the game reloads your state while your lounger earns: once per XP (the server pays what you
 * collected when you make a request, so the tag and the bar move a step each time). One small request each
 * time, and none while alone, hidden or Rested.
 */
export const LOUNGE_REFRESH_MS: number = RULES.experience.lounge.msPerXp;

/**
 * Whether your lounger is earning now, so the state is worth reloading every `LOUNGE_REFRESH_MS`: someone
 * else is here (Discord's participants, the same list the server pays from), the page is visible, you have a
 * lounger and it is not Rested yet.
 */
export function loungeEarning(
  company: boolean,
  hidden: boolean,
  state: Pick<GameState, 'loungerId' | 'loungeXp'>,
): boolean {
  if (!company || hidden || state.loungerId === null) return false;
  return !isRested(state.loungeXp[state.loungerId] ?? 0);
}

/**
 * How long to wait before the next poll: `ROOM_POLL_MS` after the last full fetch was tried and
 * ended (so a failing request is not retried in a hurry), never negative and never more than one interval.
 */
export function nextPollDelay(lastAttemptAt: number | null, now: number): number {
  if (lastAttemptAt === null) return ROOM_POLL_MS;
  return Math.min(ROOM_POLL_MS, Math.max(0, lastAttemptAt + ROOM_POLL_MS - now));
}

/**
 * What to do when the page becomes visible again: refetch at once when the data is over one poll
 * interval old (it paused while hidden), else just wait for the next poll.
 */
export function onVisibleAction(lastFullFetchAt: number | null, now: number): 'refresh' | 'wait' {
  return isStale(lastFullFetchAt, now, ROOM_POLL_MS) ? 'refresh' : 'wait';
}

/**
 * The player's chosen spot once a move has been answered: `settled` (the server's answer, or the old
 * spot after a failure) replaces the optimistic claim, but only when that claim is still the current
 * one; a newer move made meanwhile is left alone.
 */
export function settleClaim(
  current: LoungeSpot | null,
  optimistic: LoungeSpot,
  settled: LoungeSpot | null,
): LoungeSpot | null {
  return current !== null && current.id === optimistic.id && current.at === optimistic.at
    ? settled
    : current;
}

/**
 * The player's own resident, from the game state: the lounger from `state.creatures` and
 * `state.loungerId`, and the chosen spot from `state.loungeSpot`. Null creature when there is no lounger (everything busy) or the id is not in the list.
 * `craftingLevels` maps creature ids to Crafting levels once the gear view has loaded; `gearItems` are
 * the gear view's items (empty until loaded), which give the worn item its main stat.
 */
export function ownResident(
  state: Pick<GameState, 'creatures' | 'loungerId' | 'loungeSpot'>,
  userId: string,
  name: string,
  craftingLevels: ReadonlyMap<string, number>,
  gearItems: readonly GearItem[] = [],
): Resident {
  const lounger: Creature | undefined =
    state.loungerId === null ? undefined : state.creatures.find((c) => c.id === state.loungerId);
  return {
    userId,
    name,
    spot: state.loungeSpot,
    creature:
      lounger === undefined
        ? null
        : {
            id: lounger.id,
            species: lounger.species,
            shiny: lounger.shiny,
            level: lounger.level,
            nickname: lounger.nickname,
            quirk: lounger.quirk,
            craftingLevel: craftingLevels.get(lounger.id) ?? null,
            explorerRank: lounger.explorer.rank,
            gear: lounger.gear.map((g) => wornItemOf(g, gearItems)),
          },
  };
}

/**
 * Everyone in the room, in the order of `present`: the player's own resident (always) and the known
 * others. A present id with no answer (not a player of this guild, or not asked yet) is not shown.
 */
export function roomResidents(
  present: readonly string[],
  known: ReadonlyMap<string, Resident>,
  own: Resident,
): Resident[] {
  const seen = new Set<string>();
  const residents: Resident[] = [];
  for (const id of [own.userId, ...present]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const resident = id === own.userId ? own : known.get(id);
    if (resident !== undefined) residents.push(resident);
  }
  return residents;
}
