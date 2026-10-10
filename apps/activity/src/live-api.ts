/**
 * Live finale API: the snapshot types, a strict shape check and the requests. The shapes mirror
 * `docs/design/m5-finale.md`. Everything here is display data: the server runs the fight and
 * decides every outcome; the client sends Fire and Hold as intents.
 */
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

export interface LiveAbility {
  /** An opaque per-fight player key, the same keys as `names.players` and `LiveFight.you`. */
  alias: string;
  abilityId: string;
  mode: LiveAbilityMode;
  /** True once the ability has taken effect. */
  fired: boolean;
  /** The round it takes effect (or took effect), when known. */
  firedAtRound: number | null;
}

export interface LiveLoot {
  cleared: boolean;
  essence: number;
  jackpot: null | { essence: number; firstOnServer: boolean };
  /** The jackpot pity counter after this fight. */
  pity: number;
}

/** No finale is coming up soon (or the caller has no party). Polling stops. */
export interface LiveNone {
  status: 'none';
  serverNow: number | null;
}

export interface LiveFight {
  status: 'lobby' | 'live' | 'done';
  /** A staging practice fight: no rewards. */
  practice: boolean;
  week: string;
  party: number;
  /** The caller's opaque player key in this fight, or null. */
  you: string | null;
  startsAt: number;
  roundMs: number;
  rounds: number;
  /** The round being played now (0 in the lobby). */
  round: number;
  serverNow: number;
  boss: { id: string; name: string; element: string; hpMax: number; hpStart: number };
  row: ReplayRowEntry[];
  names: EventNames;
  abilities: LiveAbility[];
  events: FightEvent[];
  bossHp: number;
  /** Display names of the players who are watching. */
  watching: string[];
  loot: LiveLoot | null;
}

export type LiveSnapshot = LiveNone | LiveFight;

export type LiveActionRequest =
  { action: 'hold' } | { action: 'fire'; zone?: Zone; element?: string };

// --- Shape checks ---

const isLiveStatus = (value: unknown): value is LiveStatus =>
  value === 'none' || value === 'lobby' || value === 'live' || value === 'done';
const isPositiveInt = (value: unknown): value is number => isInt(value) && value > 0;
const isNonNegativeInt = (value: unknown): value is number => isInt(value) && value >= 0;

function isLiveAbility(value: unknown): value is LiveAbility {
  return (
    isRecord(value) &&
    isStr(value['alias']) &&
    isStr(value['abilityId']) &&
    (value['mode'] === 'default' || value['mode'] === 'held' || value['mode'] === 'fired') &&
    isBool(value['fired']) &&
    (value['firedAtRound'] === null || isPositiveInt(value['firedAtRound']))
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

function isLiveBoss(value: unknown): value is LiveFight['boss'] {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['element']) &&
    isPositiveInt(value['hpMax']) &&
    isNonNegativeInt(value['hpStart'])
  );
}

/** Checks a snapshot from the live endpoints. Throws on anything unexpected. */
export function parseLiveSnapshot(data: unknown): LiveSnapshot {
  if (!isRecord(data) || !isLiveStatus(data['status'])) {
    throw new Error('the server returned an unexpected finale state');
  }
  if (data['status'] === 'none') {
    return { status: 'none', serverNow: isInt(data['serverNow']) ? data['serverNow'] : null };
  }
  if (
    !isBool(data['practice']) ||
    !isStr(data['week']) ||
    !isInt(data['party']) ||
    !isNullableStr(data['you']) ||
    !isInt(data['startsAt']) ||
    !isPositiveInt(data['roundMs']) ||
    !isPositiveInt(data['rounds']) ||
    !isNonNegativeInt(data['round']) ||
    !isInt(data['serverNow']) ||
    !isLiveBoss(data['boss']) ||
    !isArrayOf(data['row'], isReplayRow) ||
    !isEventNames(data['names']) ||
    !isArrayOf(data['abilities'], isLiveAbility) ||
    !isArrayOf(data['events'], isEvent) ||
    !isNonNegativeInt(data['bossHp']) ||
    !isArrayOf(data['watching'], isStr) ||
    !(data['loot'] === null || isLiveLoot(data['loot']))
  ) {
    throw new Error('the server returned an unexpected finale state');
  }
  return data as unknown as LiveFight;
}

// --- Requests ---

/** The caller's party's live state. */
export async function fetchLive(): Promise<LiveSnapshot> {
  return parseLiveSnapshot(await apiFetch('/api/raid/live'));
}

/** Fire or Hold. Fire may carry the zone (Shield Wall) or the element (Re-mark). */
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
