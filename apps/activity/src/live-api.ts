/**
 * Live finale API: the snapshot types, a strict shape check and the requests. The shapes mirror the
 * server's `LiveSnapshot` (`apps/worker/src/raid-live-view.ts`) and `docs/design/m5-finale.md`; the
 * fixtures in `src/fixtures` are real server responses that the tests parse. Everything here is
 * display data: the server runs the fight and decides every outcome; the client sends Fire and Hold
 * as intents.
 *
 * The server sends one object for every state, with nulls where there is nothing yet (no boss HP or
 * names in the lobby, no party or start time when there is no finale soon). The parser checks that
 * object and narrows it by status: `none` carries only the clock, `lobby` has a start time but no
 * fight yet, and `live` or `done` have the whole fight.
 */
import type { Element } from '@creatures/game';
import type { EventNames, FightEvent, Zone } from '@creatures/engine';
import { apiFetch } from './api';
import {
  isArrayOf,
  isBool,
  isEvent,
  isEventNames,
  isInt,
  isJackpot,
  isNullableStr,
  isRecord,
  isReplayRow,
  isStr,
  type ReplayRowEntry,
} from './raid-api';

export type LiveStatus = 'none' | 'lobby' | 'live' | 'done';
export type LiveAbilityMode = 'default' | 'held' | 'fired';

/**
 * One use of an ability. A player has one entry for their basic ability and one for each of their
 * unlocked team creatures' abilities.
 */
export interface LiveAbility {
  /** Unique in the fight. The caller sends it to Fire or Hold their own ability. */
  key: string;
  /** An opaque per-fight player key, the same keys as `names.players` and `LiveFight.you`. */
  alias: string;
  abilityId: string;
  /** The row slot (creature id, as in `row[].id`) of a creature ability; null for a basic ability. */
  creature: string | null;
  mode: LiveAbilityMode;
  /** True once the ability has taken effect. */
  fired: boolean;
  /** The round it took effect in, once it has. */
  firedAtRound: number | null;
  /** Fire was pressed and it has not taken effect yet: the round it will take effect in. */
  fireAtRound: number | null;
  /** The round it fires in if nobody touches it (the engine's own default). */
  defaultRound: number;
}

export interface LiveLoot {
  cleared: boolean;
  essence: number;
  jackpot: null | { essence: number; firstOnServer: boolean };
  /** Raids taken part in without a jackpot, after this one. */
  pity: number;
}

/** What every state carries (the fields that are the same in the lobby and in the fight). */
interface LiveShared {
  /** A staging practice fight: no rewards. */
  practice: boolean;
  week: string;
  /** The caller's opaque player key in this fight, or null. */
  you: string | null;
  roundMs: number;
  rounds: number;
  /** The round being played now (0 before the start). */
  round: number;
  serverNow: number;
  /** The frozen fighting row, left to right. Empty in the lobby. */
  row: ReplayRowEntry[];
  abilities: LiveAbility[];
  events: FightEvent[];
  /** Display names of the players who are watching. */
  watching: string[];
  /** The caller's own loot once the fight is done. */
  loot: LiveLoot | null;
}

interface LiveBossOf<Hp> {
  id: string;
  name: string;
  element: string;
  hpMax: Hp;
  hpStart: Hp;
}

/** No finale is coming up soon (or the caller has no party). Polling stops. */
export interface LiveNone {
  status: 'none';
  serverNow: number;
}

/**
 * Before the start: the countdown and who is here. The boss HP is the party's pool, and may be
 * missing; there is no row, no names, no events and no abilities yet.
 */
export interface LiveLobby extends LiveShared {
  status: 'lobby';
  party: number;
  startsAt: number;
  boss: LiveBossOf<number | null>;
  names: EventNames | null;
  bossHp: number | null;
}

/** The fight in progress, or over (with the caller's loot, unless it was a practice fight). */
export interface LiveRunning extends LiveShared {
  status: 'live' | 'done';
  party: number;
  startsAt: number;
  boss: LiveBossOf<number>;
  names: EventNames;
  bossHp: number;
}

/** A snapshot that has a fight (or the lobby of one). */
export type LiveFight = LiveLobby | LiveRunning;

export type LiveSnapshot = LiveNone | LiveFight;

/** Fire or Hold one ability of the caller's, named by its `key`. */
export type LiveActionRequest =
  { key: string; action: 'hold' } | { key: string; action: 'fire'; zone?: Zone; element?: Element };

// --- Shape checks ---

const isLiveStatus = (value: unknown): value is LiveStatus =>
  value === 'none' || value === 'lobby' || value === 'live' || value === 'done';
const isPositiveInt = (value: unknown): value is number => isInt(value) && value > 0;
const isNonNegativeInt = (value: unknown): value is number => isInt(value) && value >= 0;
const isNullableInt = (value: unknown): value is number | null => value === null || isInt(value);

function isLiveAbility(value: unknown): value is LiveAbility {
  return (
    isRecord(value) &&
    isStr(value['key']) &&
    isStr(value['alias']) &&
    isStr(value['abilityId']) &&
    isNullableStr(value['creature']) &&
    (value['mode'] === 'default' || value['mode'] === 'held' || value['mode'] === 'fired') &&
    isBool(value['fired']) &&
    (value['firedAtRound'] === null || isPositiveInt(value['firedAtRound'])) &&
    (value['fireAtRound'] === null || isPositiveInt(value['fireAtRound'])) &&
    isNonNegativeInt(value['defaultRound'])
  );
}

function isLiveLoot(value: unknown): value is LiveLoot {
  return (
    isRecord(value) &&
    isBool(value['cleared']) &&
    isNonNegativeInt(value['essence']) &&
    (value['jackpot'] === null || isJackpot(value['jackpot'])) &&
    isNonNegativeInt(value['pity'])
  );
}

/** The boss block with its two pool numbers, which are null until the party has a pool. */
function isLiveBoss(value: unknown): value is LiveBossOf<number | null> {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['element']) &&
    (value['hpMax'] === null || isPositiveInt(value['hpMax'])) &&
    (value['hpStart'] === null || isNonNegativeInt(value['hpStart']))
  );
}

/** The fields every status carries, with the types the server sends (nullable ones included). */
function hasSharedShape(data: Record<string, unknown>): boolean {
  return (
    isBool(data['practice']) &&
    isStr(data['week']) &&
    isNullableInt(data['party']) &&
    isNullableStr(data['you']) &&
    isNullableInt(data['startsAt']) &&
    isPositiveInt(data['roundMs']) &&
    isPositiveInt(data['rounds']) &&
    isNonNegativeInt(data['round']) &&
    isInt(data['serverNow']) &&
    isLiveBoss(data['boss']) &&
    isArrayOf(data['row'], isReplayRow) &&
    (data['names'] === null || isEventNames(data['names'])) &&
    isArrayOf(data['abilities'], isLiveAbility) &&
    isArrayOf(data['events'], isEvent) &&
    (data['bossHp'] === null || isNonNegativeInt(data['bossHp'])) &&
    isArrayOf(data['watching'], isStr) &&
    (data['loot'] === null || isLiveLoot(data['loot']))
  );
}

/** Checks a snapshot from the live endpoints. Throws on anything unexpected. */
export function parseLiveSnapshot(data: unknown): LiveSnapshot {
  if (!isRecord(data) || !isLiveStatus(data['status']) || !hasSharedShape(data)) {
    throw new Error('the server returned an unexpected finale state');
  }
  if (data['status'] === 'none') return { status: 'none', serverNow: data['serverNow'] as number };
  // From the lobby on there is a party and a start time.
  if (!isInt(data['party']) || !isInt(data['startsAt'])) {
    throw new Error('the server returned an unexpected finale state');
  }
  if (data['status'] === 'lobby') return data as unknown as LiveLobby;
  // A fight in progress or over has the boss pool, the names and the HP.
  const boss = data['boss'] as LiveBossOf<number | null>;
  if (
    boss.hpMax === null ||
    boss.hpStart === null ||
    data['names'] === null ||
    data['bossHp'] === null
  ) {
    throw new Error('the server returned an unexpected finale state');
  }
  return data as unknown as LiveRunning;
}

// --- Requests ---

/** The caller's party's live state. */
export async function fetchLive(): Promise<LiveSnapshot> {
  return parseLiveSnapshot(await apiFetch('/api/raid/live'));
}

/** Fire or Hold one ability. Fire may carry the zone (Shield Wall) or the element (Re-mark). */
export async function sendLiveAction(request: LiveActionRequest): Promise<LiveSnapshot> {
  return parseLiveSnapshot(
    await apiFetch('/api/raid/live/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
}

/** Staging only: starts a practice fight. Anywhere else the server answers 404. */
export async function startPractice(): Promise<LiveSnapshot> {
  return parseLiveSnapshot(
    await apiFetch('/api/raid/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  );
}
